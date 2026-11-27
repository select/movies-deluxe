import { defineEventHandler, getQuery, createError } from 'h3'
import type Database from 'better-sqlite3'
import { getAdminDatabase } from '../../../utils/adminDb'
import type {
  LlmVerdict,
  MatchReviewCounts,
  MatchReviewListResponse,
  MatchReviewMetadataInfo,
  MatchReviewMovieInfo,
  MatchReviewQueueItem,
  MatchReviewSourceInfo,
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

interface QueueRow {
  id: number
  movieId: string
  kind: ReviewItemKind
  sourceId: string | null
  currentImdbId: string | null
  proposedImdbId: string | null
  score: number | null
  llmVerdict: LlmVerdict | null
  llmConfidence: number | null
  llmReason: string | null
  flagsJson: string
  candidateJson: string | null
  status: ReviewItemStatus
  createdAt: string
  resolvedAt: string | null
  movieTitle: string | null
  movieYear: number | null
  movieVerified: number | null
  metaTitle: string | null
  metaYear: string | null
  metaRuntime: string | null
  metaDirector: string | null
  metaActors: string | null
  metaType: string | null
  metaImdbRating: number | null
  metaImdbID: string | null
}

interface SourceRow {
  id: number
  movieId: string
  sourceId: string
  channelId: string
  channelName: string
  platform: 'youtube' | 'archive.org'
  title: string | null
  duration: number | null
  size: number | null
  description: string | null
}

const VALID_STATUSES = new Set<string>(['pending', 'approved', 'rejected', 'resolved', 'all'])
const VALID_KINDS = new Set<string>(['all', 'new_match', 'false_hit', 'archive_preview'])

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
  } catch {
    return []
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function parseRuntimeMinutes(runtimeStr: string | null): number | null {
  if (!runtimeStr) return null
  const match = runtimeStr.match(/(\d+)/)
  if (!match?.[1]) return null
  const mins = parseInt(match[1], 10)
  return mins > 0 ? mins : null
}

function computeMbPerMin(
  sizeBytes: number | null,
  durationSec: number | null,
  omdbRuntime: string | null
): number | null {
  if (!sizeBytes || sizeBytes <= 0) return null
  const minutes =
    durationSec && durationSec > 0 ? durationSec / 60 : parseRuntimeMinutes(omdbRuntime)
  if (!minutes || minutes <= 0) return null
  const mb = sizeBytes / (1024 * 1024)
  return Number((mb / minutes).toFixed(2))
}

function truncateSnippet(text: string | null, maxLength = 280): string | null {
  if (!text) return null
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function getSummaryCounts(db: Database.Database, statusFilter: string): MatchReviewCounts {
  const statusRows = db
    .prepare('SELECT status, COUNT(*) as cnt FROM match_review_queue GROUP BY status')
    .all() as Array<{ status: ReviewItemStatus; cnt: number }>

  const byStatus = {
    pending: 0,
    approved: 0,
    rejected: 0,
    resolved: 0,
  }
  for (const row of statusRows) {
    if (row.status in byStatus) {
      byStatus[row.status] = row.cnt
    }
  }

  const kindRows =
    statusFilter === 'all'
      ? (db
          .prepare('SELECT kind, COUNT(*) as cnt FROM match_review_queue GROUP BY kind')
          .all() as Array<{ kind: ReviewItemKind; cnt: number }>)
      : (db
          .prepare(
            'SELECT kind, COUNT(*) as cnt FROM match_review_queue WHERE status = ? GROUP BY kind'
          )
          .all(statusFilter) as Array<{ kind: ReviewItemKind; cnt: number }>)

  const byKind = {
    all: 0,
    new_match: 0,
    false_hit: 0,
    archive_preview: 0,
  }
  for (const row of kindRows) {
    if (row.kind in byKind) {
      byKind[row.kind] = row.cnt
      byKind.all += row.cnt
    }
  }

  return { byStatus, byKind }
}

export default defineEventHandler((event): MatchReviewListResponse => {
  const query = getQuery(event)
  const rawStatus = typeof query.status === 'string' ? query.status : 'pending'
  const rawKind = typeof query.kind === 'string' ? query.kind : 'all'
  const rawFlag = typeof query.flag === 'string' ? query.flag.trim() : ''
  const rawLimit = Number(query.limit ?? 50)
  const rawOffset = Number(query.offset ?? 0)

  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'pending'
  const kind = VALID_KINDS.has(rawKind) ? rawKind : 'all'
  const flag = rawFlag && rawFlag !== 'all' ? rawFlag : ''
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 50
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0

  try {
    const db = getAdminDatabase()
    db.exec(CREATE_QUEUE_TABLE_SQL)

    if (status === 'pending' || status === 'all') {
      db.prepare(
        `
        UPDATE match_review_queue
        SET status = 'resolved', resolvedAt = datetime('now')
        WHERE status = 'pending'
          AND kind = 'archive_preview'
          AND sourceId IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM sources s
            JOIN source_quality_marks sqm ON sqm.sourceId = s.id
            WHERE s.movieId = match_review_queue.movieId
              AND s.sourceId = match_review_queue.sourceId
              AND sqm.mark = 'incomplete'
          )
        `
      ).run()
    }

    const whereClauses: string[] = []
    const params: unknown[] = []

    if (status !== 'all') {
      whereClauses.push('q.status = ?')
      params.push(status)
    }

    if (kind !== 'all') {
      whereClauses.push('q.kind = ?')
      params.push(kind)
    }

    if (flag) {
      whereClauses.push('q.flagsJson LIKE ?')
      params.push(`%"${flag}"%`)
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM match_review_queue q ${whereSql}`)
      .get(...params) as { total: number }

    const rows = db
      .prepare(
        `
        SELECT
          q.id,
          q.movieId,
          q.kind,
          q.sourceId,
          q.currentImdbId,
          q.proposedImdbId,
          q.score,
          q.llmVerdict,
          q.llmConfidence,
          q.llmReason,
          q.flagsJson,
          q.candidateJson,
          q.status,
          q.createdAt,
          q.resolvedAt,
          m.title AS movieTitle,
          m.year AS movieYear,
          m.verified AS movieVerified,
          meta.Title AS metaTitle,
          meta.Year AS metaYear,
          meta.Runtime AS metaRuntime,
          meta.Director AS metaDirector,
          meta.Actors AS metaActors,
          meta.Type AS metaType,
          meta.imdbRating AS metaImdbRating,
          meta.imdbID AS metaImdbID
        FROM match_review_queue q
        LEFT JOIN movies m ON q.movieId = m.movieId
        LEFT JOIN metadata meta ON q.movieId = meta.movieId
        ${whereSql}
        ORDER BY
          CASE WHEN q.llmVerdict = 'mismatch' THEN 0 WHEN q.llmVerdict = 'uncertain' THEN 1 ELSE 2 END,
          q.llmConfidence DESC,
          q.createdAt DESC,
          q.id DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as QueueRow[]

    const movieIds = [...new Set(rows.map(r => r.movieId))]
    const sourcesByMovieId = new Map<string, SourceRow[]>()
    const marksBySourceDbId = new Map<number, string[]>()

    if (movieIds.length > 0) {
      const placeholders = movieIds.map(() => '?').join(', ')
      const sourceRows = db
        .prepare(
          `
          SELECT
            s.id,
            s.movieId,
            s.sourceId,
            s.channelId,
            c.name AS channelName,
            c.platform,
            s.title,
            s.duration,
            s.size,
            s.description
          FROM sources s
          JOIN channels c ON s.channelId = c.id
          WHERE s.movieId IN (${placeholders})
          ORDER BY s.id ASC
        `
        )
        .all(...movieIds) as SourceRow[]

      const sourceDbIds = sourceRows.map(s => s.id)
      if (sourceDbIds.length > 0) {
        const markPlaceholders = sourceDbIds.map(() => '?').join(', ')
        const markRows = db
          .prepare(
            `SELECT sourceId, mark FROM source_quality_marks WHERE sourceId IN (${markPlaceholders})`
          )
          .all(...sourceDbIds) as Array<{ sourceId: number; mark: string }>

        for (const m of markRows) {
          const existing = marksBySourceDbId.get(m.sourceId) || []
          existing.push(m.mark)
          marksBySourceDbId.set(m.sourceId, existing)
        }
      }

      for (const s of sourceRows) {
        const list = sourcesByMovieId.get(s.movieId) || []
        list.push(s)
        sourcesByMovieId.set(s.movieId, list)
      }
    }

    const items: MatchReviewQueueItem[] = rows.map(row => {
      const movie: MatchReviewMovieInfo | null = row.movieTitle
        ? {
            movieId: row.movieId,
            title: row.movieTitle,
            year: row.movieYear,
            verified: row.movieVerified === 1,
          }
        : null

      const metadata: MatchReviewMetadataInfo | null =
        row.metaTitle || row.metaImdbID
          ? {
              Title: row.metaTitle,
              Year: row.metaYear,
              Runtime: row.metaRuntime,
              Director: row.metaDirector,
              Actors: row.metaActors,
              Type: row.metaType,
              imdbRating: row.metaImdbRating,
              imdbID: row.metaImdbID,
            }
          : null

      const rawSources = sourcesByMovieId.get(row.movieId) || []
      const sources: MatchReviewSourceInfo[] = rawSources.map(s => ({
        id: s.id,
        sourceId: s.sourceId,
        channelId: s.channelId,
        channelName: s.channelName,
        platform: s.platform,
        title: s.title,
        duration: s.duration,
        size: s.size,
        mbPerMin: computeMbPerMin(s.size, s.duration, row.metaRuntime),
        description: truncateSnippet(s.description),
        qualityMarks: marksBySourceDbId.get(s.id) || [],
      }))

      return {
        id: row.id,
        movieId: row.movieId,
        kind: row.kind,
        sourceId: row.sourceId,
        currentImdbId: row.currentImdbId,
        proposedImdbId: row.proposedImdbId,
        score: row.score,
        llmVerdict: row.llmVerdict,
        llmConfidence: row.llmConfidence,
        llmReason: row.llmReason,
        flags: parseJsonArray(row.flagsJson),
        candidate: parseJsonObject(row.candidateJson),
        status: row.status,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        movie,
        metadata,
        sources,
      }
    })

    const counts = getSummaryCounts(db, status)

    return {
      items,
      total: countRow.total,
      limit,
      offset,
      counts,
    }
  } catch (error) {
    console.error('Failed to list match review queue:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to list match review queue',
    })
  }
})
