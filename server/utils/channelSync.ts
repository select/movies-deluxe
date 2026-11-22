import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type Database from 'better-sqlite3'
import type { Innertube } from 'youtubei.js'
import type {
  SyncChannelSummary,
  SyncChannelsRequest,
  SyncChannelsResponse,
} from '../../shared/types/admin'
import type { SourceStatus, SourceUnavailableReason } from '../../shared/types/movie'
import { getAdminDatabase } from './adminDb'
import { fetchArchiveOrgMovies, processArchiveMovie, type ArchiveOrgMovie } from './archive'
import {
  loadFailedYouTubeVideos,
  removeFailedYouTubeVideo,
  saveFailedYouTubeVideo,
  type FailureReason,
} from './failedYoutube'
import { probeArchiveSources, probeYouTubeSources } from './sourceProbe'
import { upsertMovie } from './upsertMovie'
import { processYouTubeVideo } from './youtube'
import { getChannelVideoIds } from './youtubeDataApi'

export interface YouTubeChannelEntry {
  id: string
  handle?: string
  name: string
  language?: string
  enabled: boolean
  notes?: string
}

interface DbSourceRow {
  id: number
  movieId: string
  sourceId: string
  status: SourceStatus
  unavailableReason: SourceUnavailableReason | null
  unavailableDetail: string | null
  regionRestriction: string | null
}

export interface SyncChannelsProgress {
  current: number
  total: number
  message: string
  channelId?: string
}

export interface SyncChannelsOptions extends SyncChannelsRequest {
  db?: Database.Database
  onProgress?: (progress: SyncChannelsProgress) => void
}

function getMinMovieDurationSeconds(): number {
  try {
    const config = useRuntimeConfig()
    if (typeof config?.minMovieDurationMinutes === 'number') {
      return config.minMovieDurationMinutes * 60
    }
  } catch {
    // Outside Nitro runtime (e.g. CLI script)
  }
  const envMinutes = Number(process.env.NUXT_MIN_MOVIE_DURATION_MINUTES || '40')
  return (Number.isFinite(envMinutes) && envMinutes > 0 ? envMinutes : 40) * 60
}

export function loadYouTubeChannelConfigs(): YouTubeChannelEntry[] {
  const configPath = resolve(process.cwd(), 'config/youtube-channels.json')
  const raw = readFileSync(configPath, 'utf-8')
  const parsed = JSON.parse(raw) as { channels?: YouTubeChannelEntry[] }
  return parsed.channels || []
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

function insertSyncRun(db: Database.Database, channelId: string, startedAt: number): number {
  const result = db
    .prepare(
      `
      INSERT INTO channel_sync_runs (channelId, startedAt, status)
      VALUES (?, ?, 'running')
    `
    )
    .run(channelId, startedAt)
  return Number(result.lastInsertRowid)
}

function completeSyncRun(
  db: Database.Database,
  runId: number,
  summary: SyncChannelSummary,
  completedAt: number
): void {
  db.prepare(
    `
    UPDATE channel_sync_runs
    SET
      completedAt = ?,
      status = ?,
      totalRemote = ?,
      addedCount = ?,
      removedCount = ?,
      restoredCount = ?,
      skippedFailedCount = ?,
      probedCount = ?,
      error = ?
    WHERE id = ?
  `
  ).run(
    completedAt,
    summary.error ? 'failed' : 'completed',
    summary.totalRemote,
    summary.added,
    summary.removed,
    summary.restored,
    summary.skippedFailed,
    summary.probed,
    summary.error ?? null,
    runId
  )
}

function logSyncEvent(
  db: Database.Database,
  params: {
    runId: number
    channelId: string
    sourceId: string
    movieId: string | null
    eventType: 'added' | 'removed' | 'restored' | 'status_changed'
    reason?: string | null
    detail?: string | null
    createdAt: number
  }
): void {
  db.prepare(
    `
    INSERT INTO channel_sync_events (
      runId, channelId, sourceId, movieId, eventType, reason, detail, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    params.runId,
    params.channelId,
    params.sourceId,
    params.movieId,
    params.eventType,
    params.reason ?? null,
    params.detail ?? null,
    params.createdAt
  )
}

function shouldRestoreSource(row: DbSourceRow): boolean {
  if (row.status === 'removed_from_channel' || row.status === 'unlisted') {
    return true
  }
  if (
    row.status === 'unavailable' &&
    row.unavailableReason !== 'not_embeddable' &&
    row.unavailableReason !== 'age_restricted'
  ) {
    return true
  }
  return false
}

async function fetchAllArchiveItems(
  collection = 'feature_films'
): Promise<Map<string, ArchiveOrgMovie>> {
  const remoteMap = new Map<string, ArchiveOrgMovie>()
  let cursor: string | undefined

  while (true) {
    const response = await fetchArchiveOrgMovies(collection, 1000, cursor)
    if (!response.items || response.items.length === 0) break

    for (const item of response.items) {
      if (item.identifier) {
        remoteMap.set(item.identifier, item)
      }
    }

    if (!response.cursor || response.cursor === cursor) break
    cursor = response.cursor
    await sleep(150)
  }

  return remoteMap
}

async function syncYouTubeChannel(
  db: Database.Database,
  channelConfig: YouTubeChannelEntry,
  youtube: Innertube | null,
  apiKey: string,
  options: {
    dryRun: boolean
    retryFailed: boolean
    probeActive: boolean
  }
): Promise<SyncChannelSummary> {
  const startedAt = Math.floor(Date.now() / 1000)
  const runId = options.dryRun ? undefined : insertSyncRun(db, channelConfig.id, startedAt)

  const summary: SyncChannelSummary = {
    channelId: channelConfig.id,
    channelName: channelConfig.name,
    platform: 'youtube',
    runId,
    totalRemote: 0,
    existingInDb: 0,
    added: 0,
    removed: 0,
    restored: 0,
    skippedFailed: 0,
    probed: 0,
    removalReasons: {},
  }

  try {
    // Ensure channel row exists
    if (!options.dryRun) {
      db.prepare(
        `INSERT OR IGNORE INTO channels (id, name, platform) VALUES (?, ?, 'youtube')`
      ).run(channelConfig.id, channelConfig.name)
    }

    // 1. Fetch complete remote video IDs
    const remoteIds = await getChannelVideoIds(apiKey, channelConfig.id)
    const remoteSet = new Set(remoteIds)
    summary.totalRemote = remoteSet.size

    // 2. Load existing DB sources for this channel
    const dbRows = db
      .prepare(
        `
        SELECT id, movieId, sourceId, status, unavailableReason, unavailableDetail, regionRestriction
        FROM sources
        WHERE channelId = ?
      `
      )
      .all(channelConfig.id) as DbSourceRow[]

    const dbBySourceId = new Map<string, DbSourceRow[]>()
    for (const row of dbRows) {
      const list = dbBySourceId.get(row.sourceId) || []
      list.push(row)
      dbBySourceId.set(row.sourceId, list)
    }
    summary.existingInDb = dbBySourceId.size

    // 3. Load failed video IDs
    const failedVideoIds = new Set<string>()
    if (!options.retryFailed) {
      for (const f of loadFailedYouTubeVideos()) {
        if (f.channelId === channelConfig.id) {
          failedVideoIds.add(f.videoId)
        }
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const presentIds: string[] = []
    const addedIds: string[] = []

    for (const remoteId of remoteSet) {
      if (dbBySourceId.has(remoteId)) {
        presentIds.push(remoteId)
      } else if (failedVideoIds.has(remoteId)) {
        summary.skippedFailed++
      } else {
        addedIds.push(remoteId)
      }
    }

    // 4. Present sources: update lastSeenAt and restore if previously removed/unavailable
    const updateLastSeenStmt = db.prepare(`UPDATE sources SET lastSeenAt = ? WHERE id = ?`)
    const restoreStmt = db.prepare(`
      UPDATE sources
      SET status = 'active',
          unavailableReason = NULL,
          unavailableDetail = NULL,
          lastSeenAt = ?,
          statusChangedAt = ?
      WHERE id = ?
    `)

    for (const sourceId of presentIds) {
      const rows = dbBySourceId.get(sourceId) || []
      for (const row of rows) {
        if (shouldRestoreSource(row)) {
          summary.restored++
          if (!options.dryRun && runId !== undefined) {
            restoreStmt.run(now, now, row.id)
            logSyncEvent(db, {
              runId,
              channelId: channelConfig.id,
              sourceId,
              movieId: row.movieId,
              eventType: 'restored',
              reason: row.unavailableReason,
              detail: `Restored from ${row.status}`,
              createdAt: now,
            })
          }
        } else if (!options.dryRun) {
          updateLastSeenStmt.run(now, row.id)
        }
      }
    }

    // 5. Added sources: scrape and upsert
    if (options.dryRun) {
      summary.added = addedIds.length
    } else if (addedIds.length > 0 && youtube) {
      const minDuration = getMinMovieDurationSeconds()
      for (const videoId of addedIds) {
        try {
          const fullVideo = await youtube.getBasicInfo(videoId)
          if (!fullVideo || !fullVideo.basic_info) {
            saveFailedYouTubeVideo({
              videoId,
              channelId: channelConfig.id,
              title: 'Unknown',
              reason: 'missing_data',
            })
            continue
          }

          const title = fullVideo.basic_info.title || 'Unknown'
          const duration = fullVideo.basic_info.duration || 0
          let skipReason: FailureReason | null = null

          if (
            (fullVideo.basic_info &&
              typeof fullVideo.basic_info === 'object' &&
              'is_short' in fullVideo.basic_info &&
              fullVideo.basic_info.is_short) ||
            title.toLowerCase().includes('#shorts')
          ) {
            skipReason = 'shorts'
          } else if (
            title.toLowerCase().includes('trailer') ||
            title.toLowerCase().includes('clip') ||
            title.toLowerCase().includes('preview')
          ) {
            skipReason = 'trailer_clip'
          } else if (duration < minDuration) {
            skipReason = 'duration'
          }

          if (skipReason) {
            saveFailedYouTubeVideo({
              videoId,
              channelId: channelConfig.id,
              title,
              reason: skipReason,
              duration,
            })
            continue
          }

          const movieEntry = await processYouTubeVideo(
            {
              id: videoId,
              title,
              description: fullVideo.basic_info.short_description || '',
              publishedAt:
                (fullVideo.basic_info &&
                typeof fullVideo.basic_info === 'object' &&
                'upload_date' in fullVideo.basic_info
                  ? (fullVideo.basic_info.upload_date as string)
                  : '') || '',
              channelName: fullVideo.basic_info.author || channelConfig.name,
              channelId: channelConfig.id,
              duration,
              viewCount: fullVideo.basic_info.view_count || 0,
            },
            channelConfig
          )

          if (movieEntry && movieEntry.sources[0]) {
            movieEntry.sources[0].channelName = channelConfig.name
            movieEntry.sources[0].type = 'youtube'
            movieEntry.sources[0].status = 'active'
            movieEntry.sources[0].lastSeenAt = now
            await upsertMovie(movieEntry.movieId, movieEntry)
            removeFailedYouTubeVideo(videoId)
            summary.added++

            if (runId !== undefined) {
              logSyncEvent(db, {
                runId,
                channelId: channelConfig.id,
                sourceId: videoId,
                movieId: movieEntry.movieId,
                eventType: 'added',
                createdAt: now,
              })
            }
          }
        } catch {
          saveFailedYouTubeVideo({
            videoId,
            channelId: channelConfig.id,
            title: 'Error',
            reason: 'api_error',
          })
        }

        await sleep(200)
      }
    }

    // 6. Missing from listing: DB active/unlisted sources absent from remoteSet
    const missingRows: DbSourceRow[] = []
    for (const [sourceId, rows] of dbBySourceId.entries()) {
      if (!remoteSet.has(sourceId)) {
        for (const row of rows) {
          if (row.status === 'active' || row.status === 'unlisted') {
            missingRows.push(row)
          }
        }
      }
    }

    if (missingRows.length > 0) {
      const missingIds = [...new Set(missingRows.map(r => r.sourceId))]
      const probeResults = await probeYouTubeSources(missingIds, {
        apiKey,
        youtube: youtube ?? undefined,
      })
      summary.probed += missingIds.length

      const updateMissingStmt = db.prepare(`
        UPDATE sources
        SET status = ?,
            unavailableReason = ?,
            unavailableDetail = ?,
            regionRestriction = COALESCE(?, regionRestriction),
            lastCheckedAt = ?,
            statusChangedAt = ?
        WHERE id = ?
      `)

      for (const row of missingRows) {
        const probe = probeResults.get(row.sourceId)
        if (!probe) continue

        // If missing from channel listing and probe says active, mark as removed_from_channel
        const finalStatus: SourceStatus =
          probe.status === 'active' ? 'removed_from_channel' : probe.status
        const finalReason = probe.unavailableReason ?? null
        const finalDetail = probe.unavailableDetail ?? null

        const reasonKey = finalReason || finalStatus
        summary.removalReasons[reasonKey] = (summary.removalReasons[reasonKey] || 0) + 1
        summary.removed++

        if (!options.dryRun && runId !== undefined) {
          const changed =
            row.status !== finalStatus || (row.unavailableReason ?? null) !== finalReason
          updateMissingStmt.run(
            finalStatus,
            finalReason,
            finalDetail,
            probe.regionRestriction ? JSON.stringify(probe.regionRestriction) : null,
            probe.checkedAt,
            changed ? probe.checkedAt : null,
            row.id
          )

          if (changed) {
            logSyncEvent(db, {
              runId,
              channelId: channelConfig.id,
              sourceId: row.sourceId,
              movieId: row.movieId,
              eventType: finalStatus === 'unlisted' ? 'status_changed' : 'removed',
              reason: finalReason,
              detail: finalDetail,
              createdAt: probe.checkedAt,
            })
          }
        }
      }
    }

    // 7. Optional: probe active YouTube sources via Stage 1 batch
    if (options.probeActive && presentIds.length > 0) {
      const probeResults = await probeYouTubeSources(presentIds, {
        apiKey,
        skipStage2: true,
      })
      summary.probed += presentIds.length

      if (!options.dryRun && runId !== undefined) {
        const updateActiveStmt = db.prepare(`
          UPDATE sources
          SET status = ?,
              unavailableReason = ?,
              unavailableDetail = ?,
              regionRestriction = ?,
              lastCheckedAt = ?,
              statusChangedAt = CASE WHEN status != ? OR COALESCE(unavailableReason, '') != COALESCE(?, '') THEN ? ELSE statusChangedAt END
          WHERE id = ?
        `)

        for (const sourceId of presentIds) {
          const probe = probeResults.get(sourceId)
          if (!probe) continue
          const rows = dbBySourceId.get(sourceId) || []
          for (const row of rows) {
            const newReason = probe.unavailableReason ?? null
            const changed =
              row.status !== probe.status || (row.unavailableReason ?? null) !== newReason

            updateActiveStmt.run(
              probe.status,
              newReason,
              probe.unavailableDetail ?? null,
              probe.regionRestriction ? JSON.stringify(probe.regionRestriction) : null,
              probe.checkedAt,
              probe.status,
              newReason,
              probe.checkedAt,
              row.id
            )

            if (changed) {
              logSyncEvent(db, {
                runId,
                channelId: channelConfig.id,
                sourceId,
                movieId: row.movieId,
                eventType: 'status_changed',
                reason: newReason,
                detail: probe.unavailableDetail,
                createdAt: probe.checkedAt,
              })
            }
          }
        }
      }
    }

    if (!options.dryRun && runId !== undefined) {
      completeSyncRun(db, runId, summary, Math.floor(Date.now() / 1000))
    }

    return summary
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error)
    if (!options.dryRun && runId !== undefined) {
      completeSyncRun(db, runId, summary, Math.floor(Date.now() / 1000))
    }
    return summary
  }
}

async function syncArchiveCollection(
  db: Database.Database,
  options: {
    dryRun: boolean
  }
): Promise<SyncChannelSummary> {
  const channelId = 'archive.org'
  const channelName = 'Archive.org'
  const startedAt = Math.floor(Date.now() / 1000)
  const runId = options.dryRun ? undefined : insertSyncRun(db, channelId, startedAt)

  const summary: SyncChannelSummary = {
    channelId,
    channelName,
    platform: 'archive.org',
    runId,
    totalRemote: 0,
    existingInDb: 0,
    added: 0,
    removed: 0,
    restored: 0,
    skippedFailed: 0,
    probed: 0,
    removalReasons: {},
  }

  try {
    if (!options.dryRun) {
      db.prepare(
        `INSERT OR IGNORE INTO channels (id, name, platform) VALUES ('archive.org', 'Archive.org', 'archive.org')`
      ).run()
    }

    const remoteMap = await fetchAllArchiveItems('feature_films')
    summary.totalRemote = remoteMap.size

    const dbRows = db
      .prepare(
        `
        SELECT id, movieId, sourceId, status, unavailableReason, unavailableDetail, regionRestriction
        FROM sources
        WHERE channelId = 'archive.org'
      `
      )
      .all() as DbSourceRow[]

    const dbBySourceId = new Map<string, DbSourceRow[]>()
    for (const row of dbRows) {
      const list = dbBySourceId.get(row.sourceId) || []
      list.push(row)
      dbBySourceId.set(row.sourceId, list)
    }
    summary.existingInDb = dbBySourceId.size

    const now = Math.floor(Date.now() / 1000)
    const presentIds: string[] = []
    const addedItems: ArchiveOrgMovie[] = []

    for (const [identifier, item] of remoteMap.entries()) {
      if (dbBySourceId.has(identifier)) {
        presentIds.push(identifier)
      } else {
        addedItems.push(item)
      }
    }

    // Present items
    const updateLastSeenStmt = db.prepare(`UPDATE sources SET lastSeenAt = ? WHERE id = ?`)
    const restoreStmt = db.prepare(`
      UPDATE sources
      SET status = 'active',
          unavailableReason = NULL,
          unavailableDetail = NULL,
          lastSeenAt = ?,
          statusChangedAt = ?
      WHERE id = ?
    `)

    for (const identifier of presentIds) {
      const rows = dbBySourceId.get(identifier) || []
      for (const row of rows) {
        if (shouldRestoreSource(row)) {
          summary.restored++
          if (!options.dryRun && runId !== undefined) {
            restoreStmt.run(now, now, row.id)
            logSyncEvent(db, {
              runId,
              channelId,
              sourceId: identifier,
              movieId: row.movieId,
              eventType: 'restored',
              reason: row.unavailableReason,
              detail: `Restored from ${row.status}`,
              createdAt: now,
            })
          }
        } else if (!options.dryRun) {
          updateLastSeenStmt.run(now, row.id)
        }
      }
    }

    // Added items
    if (options.dryRun) {
      summary.added = addedItems.length
    } else {
      for (const item of addedItems) {
        const movieEntry = await processArchiveMovie(item, 'feature_films')
        if (movieEntry && movieEntry.sources[0]) {
          movieEntry.sources[0].channelName = channelName
          movieEntry.sources[0].status = 'active'
          movieEntry.sources[0].lastSeenAt = now
          await upsertMovie(movieEntry.movieId, movieEntry)
          summary.added++

          if (runId !== undefined) {
            logSyncEvent(db, {
              runId,
              channelId,
              sourceId: item.identifier,
              movieId: movieEntry.movieId,
              eventType: 'added',
              createdAt: now,
            })
          }
        }
      }
    }

    // Missing items
    const missingRows: DbSourceRow[] = []
    for (const [sourceId, rows] of dbBySourceId.entries()) {
      if (!remoteMap.has(sourceId)) {
        for (const row of rows) {
          if (row.status === 'active' || row.status === 'unlisted') {
            missingRows.push(row)
          }
        }
      }
    }

    if (missingRows.length > 0) {
      const missingIds = [...new Set(missingRows.map(r => r.sourceId))]
      const probeResults = await probeArchiveSources(missingIds)
      summary.probed += missingIds.length

      const updateMissingStmt = db.prepare(`
        UPDATE sources
        SET status = ?,
            unavailableReason = ?,
            unavailableDetail = ?,
            lastCheckedAt = ?,
            statusChangedAt = ?
        WHERE id = ?
      `)

      for (const row of missingRows) {
        const probe = probeResults.get(row.sourceId)
        if (!probe) continue

        const finalStatus: SourceStatus =
          probe.status === 'active' ? 'removed_from_channel' : probe.status
        const finalReason = probe.unavailableReason ?? null
        const finalDetail = probe.unavailableDetail ?? null

        const reasonKey = finalReason || finalStatus
        summary.removalReasons[reasonKey] = (summary.removalReasons[reasonKey] || 0) + 1
        summary.removed++

        if (!options.dryRun && runId !== undefined) {
          const changed =
            row.status !== finalStatus || (row.unavailableReason ?? null) !== finalReason
          updateMissingStmt.run(
            finalStatus,
            finalReason,
            finalDetail,
            probe.checkedAt,
            changed ? probe.checkedAt : null,
            row.id
          )

          if (changed) {
            logSyncEvent(db, {
              runId,
              channelId,
              sourceId: row.sourceId,
              movieId: row.movieId,
              eventType: finalStatus === 'unlisted' ? 'status_changed' : 'removed',
              reason: finalReason,
              detail: finalDetail,
              createdAt: probe.checkedAt,
            })
          }
        }
      }
    }

    if (!options.dryRun && runId !== undefined) {
      completeSyncRun(db, runId, summary, Math.floor(Date.now() / 1000))
    }

    return summary
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error)
    if (!options.dryRun && runId !== undefined) {
      completeSyncRun(db, runId, summary, Math.floor(Date.now() / 1000))
    }
    return summary
  }
}

export async function syncChannels(
  options: SyncChannelsOptions = {}
): Promise<SyncChannelsResponse> {
  const startedAt = Math.floor(Date.now() / 1000)
  const db = options.db ?? getAdminDatabase()
  const platform = options.platform ?? 'all'
  const dryRun = options.dryRun ?? false
  const retryFailed = options.retryFailed ?? false
  const probeActive = options.probeActive ?? false

  const requestedChannels = options.channels?.filter(Boolean)
  const allYtConfigs = loadYouTubeChannelConfigs()
  const enabledYtConfigs = allYtConfigs.filter(c => c.enabled)

  const ytTargets =
    platform === 'archive'
      ? []
      : requestedChannels && requestedChannels.length > 0
        ? allYtConfigs.filter(c => requestedChannels.includes(c.id))
        : enabledYtConfigs

  const includeArchive =
    platform === 'archive' ||
    (platform === 'all' &&
      (!requestedChannels ||
        requestedChannels.length === 0 ||
        requestedChannels.includes('archive.org')))

  const totalTargets = ytTargets.length + (includeArchive ? 1 : 0)
  const summaries: SyncChannelSummary[] = []
  let completedTargets = 0

  if (ytTargets.length > 0) {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) {
      for (const ch of ytTargets) {
        completedTargets++
        summaries.push({
          channelId: ch.id,
          channelName: ch.name,
          platform: 'youtube',
          totalRemote: 0,
          existingInDb: 0,
          added: 0,
          removed: 0,
          restored: 0,
          skippedFailed: 0,
          probed: 0,
          removalReasons: {},
          error: 'YOUTUBE_API_KEY environment variable is not set',
        })
        options.onProgress?.({
          current: completedTargets,
          total: totalTargets,
          channelId: ch.id,
          message: `[${ch.name}] Skipped: missing YOUTUBE_API_KEY`,
        })
      }
    } else {
      let youtube: Innertube | null = null
      if (!dryRun) {
        const { Innertube } = await import('youtubei.js')
        youtube = await Innertube.create()
      }

      for (const ch of ytTargets) {
        options.onProgress?.({
          current: completedTargets,
          total: totalTargets,
          channelId: ch.id,
          message: `Syncing ${ch.name}...`,
        })

        const summary = await syncYouTubeChannel(db, ch, youtube, apiKey, {
          dryRun,
          retryFailed,
          probeActive,
        })
        summaries.push(summary)
        completedTargets++

        options.onProgress?.({
          current: completedTargets,
          total: totalTargets,
          channelId: ch.id,
          message: `Finished ${ch.name}: +${summary.added} / -${summary.removed} / ↺${summary.restored}`,
        })
      }
    }
  }

  if (includeArchive) {
    options.onProgress?.({
      current: completedTargets,
      total: totalTargets,
      channelId: 'archive.org',
      message: 'Syncing Archive.org (feature_films)...',
    })

    const archiveSummary = await syncArchiveCollection(db, { dryRun })
    summaries.push(archiveSummary)
    completedTargets++

    options.onProgress?.({
      current: completedTargets,
      total: totalTargets,
      channelId: 'archive.org',
      message: `Finished Archive.org: +${archiveSummary.added} / -${archiveSummary.removed} / ↺${archiveSummary.restored}`,
    })
  }

  const completedAt = Math.floor(Date.now() / 1000)
  const totals = summaries.reduce(
    (acc, s) => {
      acc.totalRemote += s.totalRemote
      acc.added += s.added
      acc.removed += s.removed
      acc.restored += s.restored
      acc.skippedFailed += s.skippedFailed
      acc.probed += s.probed
      if (s.error) acc.errors++
      return acc
    },
    {
      totalRemote: 0,
      added: 0,
      removed: 0,
      restored: 0,
      skippedFailed: 0,
      probed: 0,
      errors: 0,
    }
  )

  return {
    success: totals.errors === 0,
    dryRun,
    startedAt,
    completedAt,
    channels: summaries,
    totals,
  }
}
