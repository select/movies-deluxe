import { defineEventHandler, readBody, createError } from 'h3'
import { getAdminDatabase, withTransaction } from '../../../utils/adminDb'
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

export default defineEventHandler(async (event): Promise<MatchReviewBulkActionResponse> => {
  const body = await readBody<MatchReviewBulkActionRequest>(event)
  const action = body?.action

  if (action !== 'mark_all_previews' && action !== 'keep_all_llm_matches') {
    throw createError({
      statusCode: 400,
      message: `Invalid bulk action: ${String(action)}`,
    })
  }

  const db = getAdminDatabase()
  db.exec(CREATE_QUEUE_TABLE_SQL)

  const now = new Date().toISOString()

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
