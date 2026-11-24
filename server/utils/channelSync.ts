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
import { processArchiveMovie, type ArchiveOrgMovie, type ArchiveOrgResponse } from './archive'
import {
  loadFailedYouTubeVideos,
  removeFailedYouTubeVideo,
  saveFailedYouTubeVideo,
  type FailureReason,
} from './failedYoutube'
import { probeArchiveSources, probeYouTubeSources, type SourceProbeResult } from './sourceProbe'
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
  channelName?: string
  channelCurrent?: number
  channelTotal?: number
  successCurrent?: number
  failedCurrent?: number
  rate?: number
  estimatedTimeRemaining?: number
}

interface ChannelItemProgress {
  current: number
  total: number
  message: string
  successCurrent?: number
  failedCurrent?: number
  rate?: number
  estimatedTimeRemaining?: number
}

export interface SyncChannelsOptions extends SyncChannelsRequest {
  db?: Database.Database
  onProgress?: (progress: SyncChannelsProgress) => void
}

function getMinMovieDurationSeconds(): number {
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

async function fetchArchivePageWithRetry(
  collection: string,
  rows: number,
  cursor?: string,
  maxAttempts = 3
): Promise<ArchiveOrgResponse> {
  const url = new URL('https://archive.org/services/search/v1/scrape')
  url.searchParams.set('q', `mediatype:movies AND collection:${collection}`)
  url.searchParams.set(
    'fields',
    'identifier,title,description,date,year,downloads,collection,language,item_size'
  )
  url.searchParams.set('count', Math.max(100, rows).toString())
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url.toString())
      if (!response.ok) {
        throw new Error(`Archive.org HTTP ${response.status}: ${response.statusText}`)
      }
      const data = (await response.json()) as ArchiveOrgResponse
      if (!data || !Array.isArray(data.items)) {
        throw new Error('Archive.org returned malformed scrape response (missing items array)')
      }
      return data
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) {
        await sleep(500 * Math.pow(2, attempt - 1))
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Archive.org fetch failed: ${String(lastError)}`)
}

async function fetchAllArchiveItems(
  collection = 'feature_films',
  onStatus?: (message: string) => void
): Promise<Map<string, ArchiveOrgMovie>> {
  const remoteMap = new Map<string, ArchiveOrgMovie>()
  let cursor: string | undefined
  let expectedTotal: number | null = null
  let page = 0

  while (true) {
    page++
    const response = await fetchArchivePageWithRetry(collection, 1000, cursor)

    if (expectedTotal === null && typeof response.total === 'number') {
      expectedTotal = response.total
    }

    if (response.items.length === 0) {
      if (expectedTotal !== null && expectedTotal > 0 && remoteMap.size < expectedTotal * 0.9) {
        throw new Error(
          `Archive.org pagination stopped abruptly at ${remoteMap.size}/${expectedTotal} items`
        )
      }
      break
    }

    for (const item of response.items) {
      if (item.identifier) {
        remoteMap.set(item.identifier, item)
      }
    }

    if (page === 1 || page % 5 === 0) {
      onStatus?.(
        `Archive.org page ${page}: ${remoteMap.size}${expectedTotal ? `/${expectedTotal}` : ''} items`
      )
    }

    if (!response.cursor || response.cursor === cursor) {
      break
    }
    cursor = response.cursor
    await sleep(150)
  }

  if (expectedTotal !== null && expectedTotal > 0 && remoteMap.size === 0) {
    throw new Error(`Archive.org returned 0 items when expectedTotal=${expectedTotal}`)
  }

  if (expectedTotal !== null && expectedTotal > 0 && remoteMap.size < expectedTotal * 0.9) {
    throw new Error(
      `Archive.org crawl incomplete: fetched ${remoteMap.size} of ${expectedTotal} expected items`
    )
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
    onStatus?: (message: string) => void
    onProgress?: (progress: ChannelItemProgress) => void
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

    options.onStatus?.(
      `[${channelConfig.name}] Diff: ${remoteSet.size} remote, ${dbBySourceId.size} in DB, ${addedIds.length} new, ${summary.skippedFailed} skipped-failed`
    )

    // 5. Added sources: scrape and upsert
    if (options.dryRun) {
      summary.added = addedIds.length
    } else if (addedIds.length > 0 && youtube) {
      let addedProbeResults = new Map<string, SourceProbeResult>()
      try {
        addedProbeResults = await probeYouTubeSources(addedIds, {
          apiKey,
          skipStage2: true,
        })
      } catch (error) {
        console.warn(
          `[${channelConfig.name}] Failed to probe new videos, continuing without probe metadata:`,
          error
        )
      }

      const minDuration = getMinMovieDurationSeconds()
      const addStartTime = Date.now()
      let processedNew = 0
      let skippedOrFailed = 0

      if (addedIds.length > 0) {
        options.onProgress?.({
          current: 0,
          total: addedIds.length,
          message: `Checking ${addedIds.length} new video(s)...`,
          successCurrent: 0,
          failedCurrent: 0,
        })
      }

      for (const videoId of addedIds) {
        let itemTitle = videoId
        try {
          const fullVideo = await youtube.getBasicInfo(videoId)
          if (!fullVideo || !fullVideo.basic_info) {
            saveFailedYouTubeVideo({
              videoId,
              channelId: channelConfig.id,
              title: 'Unknown',
              reason: 'missing_data',
            })
            skippedOrFailed++
          } else {
            const title = fullVideo.basic_info.title || 'Unknown'
            itemTitle = title
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
              skippedOrFailed++
            } else {
              const probe = addedProbeResults.get(videoId)
              const hasRealProbe = probe && probe.stage !== 'skipped'

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
                  regionRestriction: hasRealProbe ? probe.regionRestriction : undefined,
                  status: hasRealProbe ? probe.status : undefined,
                  unavailableReason: hasRealProbe ? probe.unavailableReason : undefined,
                  unavailableDetail: hasRealProbe ? probe.unavailableDetail : undefined,
                  lastCheckedAt: hasRealProbe ? probe.checkedAt : undefined,
                },
                channelConfig
              )

              if (movieEntry && movieEntry.sources[0]) {
                movieEntry.sources[0].channelName = channelConfig.name
                movieEntry.sources[0].type = 'youtube'
                if (!movieEntry.sources[0].status) {
                  movieEntry.sources[0].status = 'active'
                }
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
              } else {
                skippedOrFailed++
              }
            }
          }
        } catch {
          saveFailedYouTubeVideo({
            videoId,
            channelId: channelConfig.id,
            title: 'Error',
            reason: 'api_error',
          })
          skippedOrFailed++
        }

        processedNew++
        const elapsedSec = (Date.now() - addStartTime) / 1000
        const rate =
          processedNew > 0 && elapsedSec > 0.5 ? Number((processedNew / elapsedSec).toFixed(1)) : 0
        const remaining =
          rate > 0 && addedIds.length > processedNew
            ? Math.round((addedIds.length - processedNew) / rate)
            : undefined

        options.onProgress?.({
          current: processedNew,
          total: addedIds.length,
          message: itemTitle,
          successCurrent: summary.added,
          failedCurrent: skippedOrFailed,
          rate: rate || undefined,
          estimatedTimeRemaining: remaining,
        })

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
      options.onStatus?.(`[${channelConfig.name}] Probing ${missingIds.length} missing video(s)...`)
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
            statusChangedAt = COALESCE(?, statusChangedAt)
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
    onStatus?: (message: string) => void
    onProgress?: (progress: ChannelItemProgress) => void
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

    const remoteMap = await fetchAllArchiveItems('feature_films', options.onStatus)
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

    options.onStatus?.(
      `[Archive.org] Diff: ${remoteMap.size} remote, ${dbBySourceId.size} in DB, ${addedItems.length} new`
    )

    // Added items
    if (options.dryRun) {
      summary.added = addedItems.length
    } else {
      const addStartTime = Date.now()
      let processedNew = 0
      let skippedOrFailed = 0

      if (addedItems.length > 0) {
        options.onProgress?.({
          current: 0,
          total: addedItems.length,
          message: `Adding ${addedItems.length} new item(s)...`,
          successCurrent: 0,
          failedCurrent: 0,
        })
      }

      for (const item of addedItems) {
        processedNew++
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
        } else {
          skippedOrFailed++
        }

        if (processedNew % 10 === 0 || processedNew === addedItems.length) {
          const elapsedSec = (Date.now() - addStartTime) / 1000
          const rate =
            processedNew > 0 && elapsedSec > 0.5
              ? Number((processedNew / elapsedSec).toFixed(1))
              : 0
          const remaining =
            rate > 0 && addedItems.length > processedNew
              ? Math.round((addedItems.length - processedNew) / rate)
              : undefined

          options.onProgress?.({
            current: processedNew,
            total: addedItems.length,
            message: item.title || item.identifier,
            successCurrent: summary.added,
            failedCurrent: skippedOrFailed,
            rate: rate || undefined,
            estimatedTimeRemaining: remaining,
          })
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
      options.onStatus?.(`[Archive.org] Probing ${missingIds.length} missing item(s)...`)
      const probeResults = await probeArchiveSources(missingIds)
      summary.probed += missingIds.length

      const updateMissingStmt = db.prepare(`
        UPDATE sources
        SET status = ?,
            unavailableReason = ?,
            unavailableDetail = ?,
            lastCheckedAt = ?,
            statusChangedAt = COALESCE(?, statusChangedAt)
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
        const channelCurrent = completedTargets + 1
        options.onProgress?.({
          current: 0,
          total: 0,
          channelId: ch.id,
          channelName: ch.name,
          channelCurrent,
          channelTotal: totalTargets,
          message: `Fetching ${ch.name} playlist...`,
        })

        const summary = await syncYouTubeChannel(db, ch, youtube, apiKey, {
          dryRun,
          retryFailed,
          probeActive,
          onStatus: message => {
            options.onProgress?.({
              current: 0,
              total: 0,
              channelId: ch.id,
              channelName: ch.name,
              channelCurrent,
              channelTotal: totalTargets,
              message,
            })
          },
          onProgress: itemProgress => {
            options.onProgress?.({
              ...itemProgress,
              channelId: ch.id,
              channelName: ch.name,
              channelCurrent,
              channelTotal: totalTargets,
            })
          },
        })
        summaries.push(summary)
        completedTargets++

        options.onProgress?.({
          current: completedTargets,
          total: totalTargets,
          channelId: ch.id,
          channelName: ch.name,
          channelCurrent,
          channelTotal: totalTargets,
          successCurrent: summary.added,
          message: `Finished ${ch.name}: +${summary.added} / -${summary.removed} / ↺${summary.restored}`,
        })
      }
    }
  }

  if (includeArchive) {
    const channelCurrent = completedTargets + 1
    options.onProgress?.({
      current: 0,
      total: 0,
      channelId: 'archive.org',
      channelName: 'Archive.org',
      channelCurrent,
      channelTotal: totalTargets,
      message: 'Fetching Archive.org catalog...',
    })

    const archiveSummary = await syncArchiveCollection(db, {
      dryRun,
      onStatus: message => {
        options.onProgress?.({
          current: 0,
          total: 0,
          channelId: 'archive.org',
          channelName: 'Archive.org',
          channelCurrent,
          channelTotal: totalTargets,
          message,
        })
      },
      onProgress: itemProgress => {
        options.onProgress?.({
          ...itemProgress,
          channelId: 'archive.org',
          channelName: 'Archive.org',
          channelCurrent,
          channelTotal: totalTargets,
        })
      },
    })
    summaries.push(archiveSummary)
    completedTargets++

    options.onProgress?.({
      current: completedTargets,
      total: totalTargets,
      channelId: 'archive.org',
      channelName: 'Archive.org',
      channelCurrent,
      channelTotal: totalTargets,
      successCurrent: archiveSummary.added,
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
