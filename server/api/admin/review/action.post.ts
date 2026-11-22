import { defineEventHandler, readBody, createError } from 'h3'
import { getAdminDatabase, withTransaction } from '../../../utils/adminDb'
import { migrateMovieId } from '../../../utils/migrateMovieId'
import { getMovieByImdbId } from '../../../utils/omdb'
import { upsertMovie } from '../../../utils/upsertMovie'
import { isImdbId, generateArchiveId, generateYouTubeId } from '#shared/types/movie'
import type { MovieEntry } from '#shared/types/movie'
import type {
  MatchReviewActionRequest,
  MatchReviewActionResponse,
  MatchReviewActionType,
  ReviewItemKind,
  ReviewItemStatus,
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

const VALID_ACTIONS = new Set<MatchReviewActionType>([
  'keep_verified',
  'approve_match',
  'unmatch',
  'mark_preview',
  'remove_source',
  'reject',
])

interface QueueRow {
  id: number
  movieId: string
  kind: ReviewItemKind
  sourceId: string | null
  currentImdbId: string | null
  proposedImdbId: string | null
  status: ReviewItemStatus
}

export default defineEventHandler(async (event): Promise<MatchReviewActionResponse> => {
  const body = await readBody<MatchReviewActionRequest>(event)
  const id = Number(body?.id)
  const action = body?.action
  const customImdbId = typeof body?.customImdbId === 'string' ? body.customImdbId.trim() : ''

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Valid queue item id is required',
    })
  }

  if (!action || !VALID_ACTIONS.has(action)) {
    throw createError({
      statusCode: 400,
      message: `Invalid action: ${String(action)}`,
    })
  }

  const db = getAdminDatabase()
  db.exec(CREATE_QUEUE_TABLE_SQL)

  const item = db
    .prepare(
      'SELECT id, movieId, kind, sourceId, currentImdbId, proposedImdbId, status FROM match_review_queue WHERE id = ?'
    )
    .get(id) as QueueRow | undefined

  if (!item) {
    throw createError({
      statusCode: 404,
      message: `Review queue item ${id} not found`,
    })
  }

  const now = new Date().toISOString()

  try {
    if (action === 'keep_verified') {
      await withTransaction(async txDb => {
        txDb
          .prepare('UPDATE movies SET verified = 1, lastUpdated = ? WHERE movieId = ?')
          .run(now, item.movieId)
        txDb
          .prepare(
            "UPDATE match_review_queue SET status = 'rejected', resolvedAt = datetime('now') WHERE id = ?"
          )
          .run(id)
      })

      return {
        success: true,
        id,
        action,
        status: 'rejected',
        movieId: item.movieId,
        message: 'Movie marked as verified and review item dismissed',
      }
    }

    if (action === 'reject') {
      db.prepare(
        "UPDATE match_review_queue SET status = 'rejected', resolvedAt = datetime('now') WHERE id = ?"
      ).run(id)

      return {
        success: true,
        id,
        action,
        status: 'rejected',
        movieId: item.movieId,
        message: 'Review item dismissed',
      }
    }

    if (action === 'remove_source') {
      if (!item.sourceId) {
        throw createError({
          statusCode: 400,
          message: 'No flagged sourceId on this queue item',
        })
      }

      const sourceCountRow = db
        .prepare('SELECT COUNT(*) as cnt FROM sources WHERE movieId = ?')
        .get(item.movieId) as { cnt: number }

      if (sourceCountRow.cnt <= 1) {
        throw createError({
          statusCode: 400,
          message:
            'Cannot remove the only source on a movie; use Mark Preview/Incomplete or Unmatch',
        })
      }

      await withTransaction(async txDb => {
        txDb
          .prepare('DELETE FROM sources WHERE movieId = ? AND sourceId = ?')
          .run(item.movieId, item.sourceId)
        txDb.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, item.movieId)
        txDb
          .prepare(
            "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ?"
          )
          .run(id)
      })

      return {
        success: true,
        id,
        action,
        status: 'approved',
        movieId: item.movieId,
        message: `Removed flagged source ${item.sourceId}`,
      }
    }

    if (action === 'mark_preview') {
      await withTransaction(async txDb => {
        const sourceRow = item.sourceId
          ? (txDb
              .prepare('SELECT id FROM sources WHERE movieId = ? AND sourceId = ? LIMIT 1')
              .get(item.movieId, item.sourceId) as { id: number } | undefined)
          : (txDb
              .prepare('SELECT id FROM sources WHERE movieId = ? ORDER BY id ASC LIMIT 1')
              .get(item.movieId) as { id: number } | undefined)

        if (sourceRow) {
          const existingMark = txDb
            .prepare(
              "SELECT id FROM source_quality_marks WHERE sourceId = ? AND mark = 'incomplete' LIMIT 1"
            )
            .get(sourceRow.id) as { id: number } | undefined

          if (!existingMark) {
            txDb
              .prepare(
                "INSERT INTO source_quality_marks (sourceId, mark, addedAt) VALUES (?, 'incomplete', ?)"
              )
              .run(sourceRow.id, now)
          }
        } else {
          const existingLabel = txDb
            .prepare(
              "SELECT id FROM movie_quality_labels WHERE movieId = ? AND label = 'clip' LIMIT 1"
            )
            .get(item.movieId) as { id: number } | undefined

          if (!existingLabel) {
            txDb
              .prepare(
                "INSERT INTO movie_quality_labels (movieId, label, addedAt) VALUES (?, 'clip', ?)"
              )
              .run(item.movieId, now)
          }
        }

        txDb.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, item.movieId)
        txDb
          .prepare(
            "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ?"
          )
          .run(id)
      })

      return {
        success: true,
        id,
        action,
        status: 'approved',
        movieId: item.movieId,
        message: 'Marked source as incomplete/preview',
      }
    }

    if (action === 'unmatch') {
      let finalMovieId = item.movieId

      const primarySource = db
        .prepare(
          `
          SELECT s.sourceId, s.title, c.platform
          FROM sources s
          JOIN channels c ON s.channelId = c.id
          WHERE s.movieId = ?
          ORDER BY s.id ASC
          LIMIT 1
        `
        )
        .get(item.movieId) as
        | { sourceId: string; title: string | null; platform: 'youtube' | 'archive.org' }
        | undefined

      if (isImdbId(item.movieId) && primarySource) {
        const baseTempId =
          primarySource.platform === 'archive.org'
            ? generateArchiveId(primarySource.sourceId)
            : generateYouTubeId(primarySource.sourceId)

        let candidateId: string = baseTempId
        let counter = 1
        while (
          candidateId !== item.movieId &&
          db.prepare('SELECT 1 FROM movies WHERE movieId = ?').get(candidateId)
        ) {
          candidateId = `${baseTempId}-${counter++}`
        }

        if (candidateId !== item.movieId) {
          const migrationResult = await migrateMovieId(item.movieId, candidateId)
          if (!migrationResult.success) {
            throw createError({
              statusCode: 500,
              message: `Failed to unmatch movie ID: ${migrationResult.message}`,
            })
          }
          finalMovieId = candidateId
        }
      }

      await withTransaction(async txDb => {
        txDb.prepare('DELETE FROM metadata WHERE movieId = ?').run(finalMovieId)
        if (primarySource?.title) {
          txDb
            .prepare('UPDATE movies SET title = ?, verified = 0, lastUpdated = ? WHERE movieId = ?')
            .run(primarySource.title, now, finalMovieId)
        } else {
          txDb
            .prepare('UPDATE movies SET verified = 0, lastUpdated = ? WHERE movieId = ?')
            .run(now, finalMovieId)
        }

        txDb
          .prepare(
            "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ?"
          )
          .run(id)
      })

      return {
        success: true,
        id,
        action,
        status: 'approved',
        movieId: finalMovieId,
        message: `Unmatched movie to ${finalMovieId}`,
      }
    }

    // action === 'approve_match'
    const targetImdbId = customImdbId || item.proposedImdbId || ''
    if (!isImdbId(targetImdbId)) {
      throw createError({
        statusCode: 400,
        message: `Valid IMDb ID (tt...) is required for approve_match, got: "${targetImdbId}"`,
      })
    }

    const apiKey = process.env.OMDB_API_KEY
    if (!apiKey) {
      throw createError({
        statusCode: 500,
        message: 'OMDB_API_KEY environment variable is required',
      })
    }

    const omdbMeta = await getMovieByImdbId(targetImdbId, apiKey)
    if (!omdbMeta) {
      throw createError({
        statusCode: 404,
        message: `IMDb ID ${targetImdbId} not found in OMDB`,
      })
    }

    const existingMovie = db
      .prepare('SELECT movieId, title, year FROM movies WHERE movieId = ?')
      .get(item.movieId) as { movieId: string; title: string; year: number | null } | undefined

    if (!existingMovie) {
      throw createError({
        statusCode: 404,
        message: `Movie ${item.movieId} not found in database`,
      })
    }

    if (targetImdbId !== item.movieId) {
      const migrationResult = await migrateMovieId(item.movieId, targetImdbId)
      if (!migrationResult.success) {
        throw createError({
          statusCode: 409,
          message: migrationResult.message,
        })
      }
    }

    const yearMatch = omdbMeta.Year?.match(/\d{4}/)
    const parsedYear = yearMatch ? parseInt(yearMatch[0], 10) : (existingMovie.year ?? undefined)

    const movieEntry: MovieEntry = {
      movieId: targetImdbId,
      title: omdbMeta.Title || existingMovie.title,
      year: parsedYear,
      sources: [],
      metadata: {
        ...omdbMeta,
        imdbID: targetImdbId,
      },
      verified: true,
      lastUpdated: now,
    }

    await upsertMovie(targetImdbId, movieEntry)

    db.prepare(
      "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ?"
    ).run(id)

    return {
      success: true,
      id,
      action,
      status: 'approved',
      movieId: targetImdbId,
      message: `Matched and verified as ${targetImdbId}`,
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('Failed to process match review action:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to process review action',
    })
  }
})
