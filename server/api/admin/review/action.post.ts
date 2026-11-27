import { defineEventHandler, readBody, createError } from 'h3'
import { getAdminDatabase, withTransaction } from '../../../utils/adminDb'
import { migrateMovieId } from '../../../utils/migrateMovieId'
import { getMovieByImdbId } from '../../../utils/omdb'
import { upsertMovie } from '../../../utils/upsertMovie'
import { findReplacementImdbMatch, upsertMetadataAndMovie } from '../../../utils/autoPipeline'
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
  'find_and_update',
  'unmatch',
  'detach_source',
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

    if (action === 'detach_source') {
      if (!item.sourceId) {
        throw createError({
          statusCode: 400,
          message: 'No flagged sourceId on this queue item',
        })
      }

      const flaggedSource = db
        .prepare(
          `
          SELECT s.id, s.sourceId, s.title, s.year, c.platform
          FROM sources s
          JOIN channels c ON s.channelId = c.id
          WHERE s.movieId = ? AND s.sourceId = ?
          LIMIT 1
        `
        )
        .get(item.movieId, item.sourceId) as
        | {
            id: number
            sourceId: string
            title: string | null
            year: number | null
            platform: 'youtube' | 'archive.org'
          }
        | undefined

      if (!flaggedSource) {
        throw createError({
          statusCode: 404,
          message: `Flagged source ${item.sourceId} not found on movie ${item.movieId}`,
        })
      }

      const sourceCountRow = db
        .prepare('SELECT COUNT(*) as cnt FROM sources WHERE movieId = ?')
        .get(item.movieId) as { cnt: number }

      if (sourceCountRow.cnt <= 1) {
        throw createError({
          statusCode: 400,
          message: 'Only one source on this movie; use Unmatch instead',
        })
      }

      const baseTempId =
        flaggedSource.platform === 'archive.org'
          ? generateArchiveId(flaggedSource.sourceId)
          : generateYouTubeId(flaggedSource.sourceId)

      let detachedMovieId: string = baseTempId
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
          .run(id)
      })

      return {
        success: true,
        id,
        action,
        status: 'approved',
        movieId: detachedMovieId,
        message: `Detached flagged source into unmatched movie ${detachedMovieId}`,
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
      let markedSources = 0

      await withTransaction(async txDb => {
        const insertMarkStmt = txDb.prepare(
          "INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt) VALUES (?, 'incomplete', ?)"
        )
        const findSourceBySourceIdStmt = txDb.prepare(
          'SELECT id FROM sources WHERE movieId = ? AND sourceId = ? LIMIT 1'
        )

        const sourceRow = item.sourceId
          ? (findSourceBySourceIdStmt.get(item.movieId, item.sourceId) as
              | { id: number }
              | undefined)
          : (txDb
              .prepare('SELECT id FROM sources WHERE movieId = ? ORDER BY id ASC LIMIT 1')
              .get(item.movieId) as { id: number } | undefined)

        if (sourceRow) {
          const res = insertMarkStmt.run(sourceRow.id, now)
          markedSources += res.changes
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

        const otherPreviewItems = txDb
          .prepare(
            "SELECT id, sourceId FROM match_review_queue WHERE movieId = ? AND kind = 'archive_preview' AND status = 'pending' AND id != ?"
          )
          .all(item.movieId, id) as Array<{ id: number; sourceId: string | null }>

        for (const other of otherPreviewItems) {
          if (!other.sourceId) continue
          const otherSource = findSourceBySourceIdStmt.get(item.movieId, other.sourceId) as
            | { id: number }
            | undefined
          if (otherSource) {
            const res = insertMarkStmt.run(otherSource.id, now)
            markedSources += res.changes
          }
        }

        txDb.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, item.movieId)
        txDb
          .prepare(
            "UPDATE match_review_queue SET status = 'approved', resolvedAt = datetime('now') WHERE id = ? OR (movieId = ? AND kind = 'archive_preview' AND status = 'pending')"
          )
          .run(id, item.movieId)
      })

      return {
        success: true,
        id,
        action,
        status: 'approved',
        movieId: item.movieId,
        message: `Marked ${markedSources} source${markedSources === 1 ? '' : 's'} as incomplete/preview`,
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

    if (action === 'find_and_update') {
      const targetSource = (
        item.sourceId
          ? db
              .prepare(
                `
                SELECT s.id, s.sourceId, s.channelId, c.platform, c.name AS channelName,
                       s.title, s.description, s.year, s.duration
                FROM sources s
                JOIN channels c ON s.channelId = c.id
                WHERE s.movieId = ? AND s.sourceId = ?
                LIMIT 1
              `
              )
              .get(item.movieId, item.sourceId)
          : db
              .prepare(
                `
                SELECT s.id, s.sourceId, s.channelId, c.platform, c.name AS channelName,
                       s.title, s.description, s.year, s.duration
                FROM sources s
                JOIN channels c ON s.channelId = c.id
                WHERE s.movieId = ?
                ORDER BY s.id ASC
                LIMIT 1
              `
              )
              .get(item.movieId)
      ) as
        | {
            id: number
            sourceId: string
            channelId: string
            platform: 'youtube' | 'archive.org'
            channelName: string
            title: string | null
            description: string | null
            year: number | null
            duration: number | null
          }
        | undefined

      if (!targetSource) {
        throw createError({
          statusCode: 404,
          message: `No source found on movie ${item.movieId} to rematch`,
        })
      }

      const sourceCountRow = db
        .prepare('SELECT COUNT(*) as cnt FROM sources WHERE movieId = ?')
        .get(item.movieId) as { cnt: number }

      const sourceDurationMin =
        targetSource.duration && targetSource.duration > 0
          ? Math.round(targetSource.duration / 60)
          : null

      const replacement = await findReplacementImdbMatch(
        {
          movieId: item.movieId,
          rawTitle: targetSource.title || targetSource.sourceId,
          description: targetSource.description,
          sourceId: targetSource.sourceId,
          platform: targetSource.platform,
          channelId: targetSource.channelId,
          channelName: targetSource.channelName,
          sourceYear: targetSource.year,
          movieYear: null,
          sourceDurationMin,
          excludeImdbId: item.movieId,
        },
        {
          minRematchConfidence: 0.75,
          allowGoogle: true,
          omdbApiKey: process.env.OMDB_API_KEY,
        }
      )

      if (!replacement || !isImdbId(replacement.imdbId)) {
        return {
          success: false,
          id,
          action,
          status: item.status,
          movieId: item.movieId,
          message:
            'No confident replacement IMDb match found. Try entering a custom IMDb ID or detaching/unmatching.',
        }
      }

      const targetImdbId = replacement.imdbId
      const matchedTitle = replacement.meta?.Title || targetImdbId
      const matchedYear = replacement.meta?.Year ? ` (${replacement.meta.Year})` : ''

      // Multi-source movie with a specific flagged source: move ONLY the flagged source to targetImdbId
      if (item.sourceId && sourceCountRow.cnt > 1) {
        await withTransaction(async txDb => {
          const targetExists = txDb
            .prepare('SELECT 1 FROM movies WHERE movieId = ?')
            .get(targetImdbId)

          if (!targetExists) {
            const yearNum = replacement.meta?.Year
              ? parseInt(replacement.meta.Year.slice(0, 4), 10)
              : null
            const validYear = yearNum && !Number.isNaN(yearNum) ? yearNum : null
            txDb
              .prepare(
                'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, 0, ?)'
              )
              .run(targetImdbId, matchedTitle, validYear, now)
          }

          if (replacement.meta) {
            upsertMetadataAndMovie(txDb, targetImdbId, replacement.meta)
          }

          const duplicateSource = txDb
            .prepare(
              'SELECT id FROM sources WHERE movieId = ? AND channelId = ? AND sourceId = ? LIMIT 1'
            )
            .get(targetImdbId, targetSource.channelId, targetSource.sourceId) as
            | { id: number }
            | undefined

          if (duplicateSource) {
            txDb.prepare('DELETE FROM sources WHERE id = ?').run(targetSource.id)
          } else {
            txDb
              .prepare('UPDATE sources SET movieId = ? WHERE id = ?')
              .run(targetImdbId, targetSource.id)
          }

          txDb
            .prepare('UPDATE movies SET lastUpdated = ? WHERE movieId IN (?, ?)')
            .run(now, item.movieId, targetImdbId)

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
          movieId: targetImdbId,
          matchedImdbId: targetImdbId,
          matchedTitle,
          confidence: replacement.confidence,
          message: `Moved flagged source to ${targetImdbId} — ${matchedTitle}${matchedYear} (${Math.round(replacement.confidence * 100)}%)`,
        }
      }

      // Single-source movie: migrate the whole movie to targetImdbId
      const migrationResult = await migrateMovieId(item.movieId, targetImdbId, {
        mergeIfExists: true,
      })

      if (!migrationResult.success) {
        throw createError({
          statusCode: 500,
          message: `Failed to migrate ${item.movieId} -> ${targetImdbId}: ${migrationResult.message}`,
        })
      }

      await withTransaction(async txDb => {
        if (replacement.meta) {
          upsertMetadataAndMovie(txDb, targetImdbId, replacement.meta)
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
        movieId: targetImdbId,
        matchedImdbId: targetImdbId,
        matchedTitle,
        confidence: replacement.confidence,
        message: `Rematched movie to ${targetImdbId} — ${matchedTitle}${matchedYear} (${Math.round(replacement.confidence * 100)}%)`,
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
      const migrationResult = await migrateMovieId(item.movieId, targetImdbId, {
        mergeIfExists: true,
      })
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
