import { defineEventHandler, readBody, createError } from 'h3'
import { getAdminDatabase, withTransaction } from '../../../utils/adminDb'
import { migrateMovieId } from '../../../utils/migrateMovieId'
import type {
  MatchReviewBulkActionRequest,
  MatchReviewBulkActionResponse,
} from '#shared/types/match-review'

const CREATE_QUEUE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS match_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movieId TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new_match', 'false_hit', 'archive_preview')),
  sourceId TEXT,
  currentImdbId TEXT,
  proposedImdbId TEXT,
  score REAL,
  llmVerdict TEXT CHECK (llmVerdict IN ('match', 'mismatch', 'uncertain') OR llmVerdict IS NULL),
  llmConfidence REAL,
  llmReason TEXT,
  flagsJson TEXT NOT NULL DEFAULT '[]',
  candidateJson TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  resolvedAt TEXT,
  UNIQUE(movieId, kind, proposedImdbId)
);
`

const TRAILER_KEYWORD_RE = /\b(trailer|tv\s*spot|preview|teaser)\b/i
const CAMELCASE_PREVIEW_RE = /(?:^|[-_])Preview[A-Z0-9]/

export default defineEventHandler(async (event): Promise<MatchReviewBulkActionResponse> => {
  const body = await readBody<MatchReviewBulkActionRequest>(event)
  const action = body?.action

  if (
    action !== 'mark_all_previews' &&
    action !== 'keep_all_llm_matches' &&
    action !== 'mark_low_ratio_trailers' &&
    action !== 'unmatch_low_sim_year_mismatch'
  ) {
    throw createError({
      statusCode: 400,
      message: `Invalid bulk action: ${String(action)}`,
    })
  }

  const db = getAdminDatabase()
  db.exec(CREATE_QUEUE_TABLE_SQL)

  const now = new Date().toISOString()

  if (action === 'unmatch_low_sim_year_mismatch') {
    let processedItems = 0
    let unmatchedMovies = 0
    let detachedSources = 0

    const items = db
      .prepare(
        `SELECT id, movieId, sourceId, flagsJson
         FROM match_review_queue
         WHERE status = 'pending'
           AND kind = 'false_hit'`
      )
      .all() as Array<{
      id: number
      movieId: string
      sourceId: string | null
      flagsJson: string
    }>

    const matching = items.filter(item => {
      try {
        const flags = JSON.parse(item.flagsJson) as unknown
        return (
          Array.isArray(flags) &&
          flags.includes('title_low_similarity') &&
          flags.includes('year_major_mismatch')
        )
      } catch {
        return false
      }
    })

    for (const item of matching) {
      const movieExists = db
        .prepare('SELECT movieId, title FROM movies WHERE movieId = ?')
        .get(item.movieId) as { movieId: string; title: string } | undefined

      if (!movieExists) {
        db.prepare(
          "UPDATE match_review_queue SET status = 'resolved', resolvedAt = datetime('now') WHERE id = ?"
        ).run(item.id)
        processedItems++
        continue
      }

      const sources = db
        .prepare(
          `SELECT s.id, s.sourceId, s.title, s.year, c.platform
           FROM sources s
           JOIN channels c ON s.channelId = c.id
           WHERE s.movieId = ?
           ORDER BY s.addedAt ASC, s.id ASC`
        )
        .all(item.movieId) as Array<{
        id: number
        sourceId: string
        title: string | null
        year: number | null
        platform: 'youtube' | 'archive.org'
      }>

      const flaggedSource = item.sourceId
        ? sources.find(s => s.sourceId === item.sourceId)
        : undefined

      if (flaggedSource && sources.length > 1) {
        const baseTempId =
          flaggedSource.platform === 'archive.org'
            ? `archive-${flaggedSource.sourceId}`
            : `youtube-${flaggedSource.sourceId}`

        let detachedMovieId = baseTempId
        let counter = 1
        while (db.prepare('SELECT 1 FROM movies WHERE movieId = ?').get(detachedMovieId)) {
          detachedMovieId = `${baseTempId}-${counter++}`
        }

        await withTransaction(async txDb => {
          txDb
            .prepare(
              'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, 0, ?)'
            )
            .run(
              detachedMovieId,
              flaggedSource.title || flaggedSource.sourceId,
              flaggedSource.year ?? null,
              now
            )
          txDb
            .prepare('UPDATE sources SET movieId = ? WHERE id = ?')
            .run(detachedMovieId, flaggedSource.id)
          txDb.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, item.movieId)
          txDb
            .prepare(
              "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ?"
            )
            .run(item.id)
        })

        detachedSources++
        processedItems++
        continue
      }

      const primarySource = flaggedSource ?? sources[0]
      if (!primarySource) {
        db.prepare('DELETE FROM metadata WHERE movieId = ?').run(item.movieId)
        db.prepare(
          "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ?"
        ).run(item.id)
        processedItems++
        continue
      }

      const baseTempId =
        primarySource.platform === 'archive.org'
          ? `archive-${primarySource.sourceId}`
          : `youtube-${primarySource.sourceId}`

      let tempMovieId = baseTempId
      let counter = 1
      while (
        tempMovieId !== item.movieId &&
        db.prepare('SELECT 1 FROM movies WHERE movieId = ?').get(tempMovieId)
      ) {
        tempMovieId = `${baseTempId}-${counter++}`
      }

      db.prepare('DELETE FROM metadata WHERE movieId = ?').run(item.movieId)
      if (tempMovieId !== item.movieId) {
        await migrateMovieId(item.movieId, tempMovieId)
      }
      db.prepare(
        'UPDATE movies SET title = ?, verified = 0, lastUpdated = ? WHERE movieId = ?'
      ).run(primarySource.title || primarySource.sourceId, now, tempMovieId)
      db.prepare(
        "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE (movieId = ? OR movieId = ?) AND status = 'pending'"
      ).run(item.movieId, tempMovieId)

      unmatchedMovies++
      processedItems++
    }

    return {
      success: true,
      processedItems,
      markedSources: unmatchedMovies + detachedSources,
      message:
        processedItems === 0
          ? 'No pending items with both title_low_similarity and year_major_mismatch found'
          : `Unmatched ${unmatchedMovies} movie${unmatchedMovies === 1 ? '' : 's'} and detached ${detachedSources} source${detachedSources === 1 ? '' : 's'} (${processedItems} queue item${processedItems === 1 ? '' : 's'} resolved)`,
    }
  }

  if (action === 'mark_low_ratio_trailers') {
    const maxMbPerMin =
      typeof body?.maxMbPerMin === 'number' && Number.isFinite(body.maxMbPerMin)
        ? body.maxMbPerMin
        : 1.2

    let markedSources = 0
    let processedItems = 0
    const touchedMovies = new Set<string>()

    await withTransaction(async txDb => {
      const candidates = txDb
        .prepare(
          `SELECT
             s.id as sourceRowId,
             s.movieId,
             s.sourceId,
             s.title,
             s.description,
             s.size,
             CAST(REPLACE(md.Runtime, ' min', '') AS INTEGER) as runtimeMin,
             EXISTS (
               SELECT 1 FROM source_quality_marks sqm
               WHERE sqm.sourceId = s.id AND sqm.mark = 'incomplete'
             ) as alreadyIncomplete
           FROM sources s
           JOIN metadata md ON md.movieId = s.movieId
           WHERE s.movieId LIKE 'tt%'
             AND s.channelId = 'archive.org'
             AND s.size IS NOT NULL
             AND md.Runtime IS NOT NULL
             AND md.Runtime LIKE '% min'
             AND CAST(REPLACE(md.Runtime, ' min', '') AS INTEGER) >= 50`
        )
        .all() as Array<{
        sourceRowId: number
        movieId: string
        sourceId: string
        title: string | null
        description: string | null
        size: number
        runtimeMin: number
        alreadyIncomplete: number
      }>

      const insertMarkStmt = txDb.prepare(
        "INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt) VALUES (?, 'incomplete', ?)"
      )
      const insertTrailerLabelStmt = txDb.prepare(
        "INSERT OR IGNORE INTO movie_quality_labels (movieId, label, addedAt) VALUES (?, 'trailer', ?)"
      )
      const countHealthyStmt = txDb.prepare(
        `SELECT COUNT(*) as cnt FROM sources s
         WHERE s.movieId = ?
           AND NOT EXISTS (
             SELECT 1 FROM source_quality_marks sqm
             WHERE sqm.sourceId = s.id AND sqm.mark = 'incomplete'
           )`
      )
      const resolveQueueStmt = txDb.prepare(
        `UPDATE match_review_queue
         SET status = 'approved', resolvedAt = datetime('now')
         WHERE status = 'pending'
           AND movieId = ?
           AND (sourceId = ? OR (sourceId IS NULL AND kind IN ('archive_preview', 'false_hit')))`
      )
      const updateMovieStmt = txDb.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')
      const hasQualityLabelsTable = Boolean(
        txDb
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'movie_quality_labels'"
          )
          .get()
      )

      for (const row of candidates) {
        const mbPerMin = row.size / (1024 * 1024) / row.runtimeMin
        if (mbPerMin >= maxMbPerMin) continue

        const combined = `${row.sourceId} ${row.title || ''} ${row.description || ''}`
        if (!TRAILER_KEYWORD_RE.test(combined) && !CAMELCASE_PREVIEW_RE.test(row.sourceId)) {
          continue
        }

        if (!row.alreadyIncomplete) {
          const markRes = insertMarkStmt.run(row.sourceRowId, now)
          markedSources += markRes.changes
          touchedMovies.add(row.movieId)
        }
        const qRes = resolveQueueStmt.run(row.movieId, row.sourceId)
        processedItems += qRes.changes
      }

      for (const movieId of touchedMovies) {
        if (hasQualityLabelsTable) {
          const healthy = countHealthyStmt.get(movieId) as { cnt: number }
          if (healthy.cnt === 0) {
            insertTrailerLabelStmt.run(movieId, now)
          }
        }
        updateMovieStmt.run(now, movieId)
      }
    })

    return {
      success: true,
      processedItems,
      markedSources,
      message:
        markedSources === 0 && processedItems === 0
          ? 'No unmarked or pending low-MB/min Archive.org trailers found'
          : `Marked ${markedSources} low-MB/min trailer source${markedSources === 1 ? '' : 's'} and resolved ${processedItems} pending queue item${processedItems === 1 ? '' : 's'}`,
    }
  }

  if (action === 'keep_all_llm_matches') {
    const minConfidence =
      typeof body?.minConfidence === 'number' && Number.isFinite(body.minConfidence)
        ? body.minConfidence
        : 0.85

    let processedItems = 0
    let verifiedMovies = 0

    await withTransaction(async txDb => {
      const matchingItems = txDb
        .prepare(
          `SELECT id, movieId FROM match_review_queue
           WHERE status = 'pending'
             AND kind = 'false_hit'
             AND llmVerdict = 'match'
             AND llmConfidence >= ?`
        )
        .all(minConfidence) as Array<{ id: number; movieId: string }>

      if (matchingItems.length === 0) return

      const verifyStmt = txDb.prepare(
        'UPDATE movies SET verified = 1, lastUpdated = ? WHERE movieId = ?'
      )
      const uniqueMovieIds = new Set(matchingItems.map(i => i.movieId))
      for (const movieId of uniqueMovieIds) {
        const res = verifyStmt.run(now, movieId)
        verifiedMovies += res.changes
      }

      const queueRes = txDb
        .prepare(
          `UPDATE match_review_queue
           SET status = 'rejected', resolvedAt = datetime('now')
           WHERE status = 'pending'
             AND kind = 'false_hit'
             AND llmVerdict = 'match'
             AND llmConfidence >= ?`
        )
        .run(minConfidence)

      processedItems = queueRes.changes
    })

    return {
      success: true,
      processedItems,
      markedSources: verifiedMovies,
      message:
        processedItems === 0
          ? 'No pending LLM-confirmed matches to verify'
          : `Verified ${verifiedMovies} movie${verifiedMovies === 1 ? '' : 's'} and dismissed ${processedItems} LLM-confirmed false-hit item${processedItems === 1 ? '' : 's'}`,
    }
  }

  const kind = body?.kind ?? 'archive_preview'

  if (kind !== 'archive_preview') {
    throw createError({
      statusCode: 400,
      message: `Invalid kind for mark_all_previews: ${String(kind)}`,
    })
  }

  try {
    let processedItems = 0
    let markedSources = 0

    await withTransaction(async txDb => {
      const pendingItems = txDb
        .prepare(
          "SELECT id, movieId, sourceId FROM match_review_queue WHERE status = 'pending' AND kind = 'archive_preview'"
        )
        .all() as Array<{ id: number; movieId: string; sourceId: string | null }>

      if (pendingItems.length === 0) {
        return
      }

      const findSourceBySourceIdStmt = txDb.prepare(
        'SELECT id FROM sources WHERE movieId = ? AND sourceId = ? LIMIT 1'
      )
      const findFirstSourceStmt = txDb.prepare(
        'SELECT id FROM sources WHERE movieId = ? ORDER BY id ASC LIMIT 1'
      )
      const insertMarkStmt = txDb.prepare(
        "INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt) VALUES (?, 'incomplete', ?)"
      )
      const updateMovieStmt = txDb.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')

      const touchedMovieIds = new Set<string>()

      for (const item of pendingItems) {
        const sourceRow = item.sourceId
          ? (findSourceBySourceIdStmt.get(item.movieId, item.sourceId) as
              | { id: number }
              | undefined)
          : (findFirstSourceStmt.get(item.movieId) as { id: number } | undefined)

        if (sourceRow) {
          const res = insertMarkStmt.run(sourceRow.id, now)
          markedSources += res.changes
        }

        touchedMovieIds.add(item.movieId)
      }

      for (const movieId of touchedMovieIds) {
        updateMovieStmt.run(now, movieId)
      }

      const queueRes = txDb
        .prepare(
          "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE status = 'pending' AND kind = 'archive_preview'"
        )
        .run()

      processedItems = queueRes.changes
    })

    return {
      success: true,
      processedItems,
      markedSources,
      message:
        processedItems === 0
          ? 'No pending archive preview items to process'
          : `Approved ${processedItems} preview queue item${processedItems === 1 ? '' : 's'} and marked ${markedSources} source${markedSources === 1 ? '' : 's'} as incomplete`,
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('Failed to process bulk match review action:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to process bulk review action',
    })
  }
})
