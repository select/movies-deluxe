import type Database from 'better-sqlite3'

export type ReviewKind = 'new_match' | 'false_hit' | 'archive_preview'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'resolved'
export type ReviewLlmVerdict = 'match' | 'mismatch' | 'uncertain'

export interface MatchReviewQueueRow {
  id: number
  movieId: string
  kind: ReviewKind
  sourceId: string | null
  currentImdbId: string | null
  proposedImdbId: string | null
  score: number | null
  llmVerdict: ReviewLlmVerdict | null
  llmConfidence: number | null
  llmReason: string | null
  flagsJson: string
  candidateJson: string | null
  status: ReviewStatus
  createdAt: string
  resolvedAt: string | null
}

export interface EnqueueReviewItemInput {
  movieId: string
  kind: ReviewKind
  sourceId?: string | null
  currentImdbId?: string | null
  proposedImdbId?: string | null
  score?: number | null
  llmVerdict?: ReviewLlmVerdict | null
  llmConfidence?: number | null
  llmReason?: string | null
  flags?: string[]
  candidate?: Record<string, unknown> | null
}

export interface ReviewQueueFilter {
  status?: ReviewStatus | 'all'
  kind?: ReviewKind | 'all'
  limit?: number
  offset?: number
}

export interface ReviewQueueStats {
  total: number
  pending: number
  approved: number
  rejected: number
  resolved: number
  byKind: Record<ReviewKind, number>
}

export function ensureMatchReviewQueueTable(db: Database.Database): void {
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_match_review_queue_status ON match_review_queue(status);
    CREATE INDEX IF NOT EXISTS idx_match_review_queue_kind ON match_review_queue(kind);
    CREATE INDEX IF NOT EXISTS idx_match_review_queue_movieId ON match_review_queue(movieId);
  `)
}

export function enqueueReviewItem(
  db: Database.Database,
  item: EnqueueReviewItemInput
): { id: number; inserted: boolean } {
  ensureMatchReviewQueueTable(db)

  const flagsJson = JSON.stringify(item.flags ?? [])
  const candidateJson = item.candidate ? JSON.stringify(item.candidate) : null
  const proposedImdbId = item.proposedImdbId ?? null

  // SQLite treats NULLs as distinct in UNIQUE constraints, so check manually when proposedImdbId is null
  if (proposedImdbId === null) {
    const existing = db
      .prepare(
        `SELECT id FROM match_review_queue
         WHERE movieId = ? AND kind = ? AND proposedImdbId IS NULL
           AND COALESCE(sourceId, '') = COALESCE(?, '')
         LIMIT 1`
      )
      .get(item.movieId, item.kind, item.sourceId ?? null) as { id: number } | undefined

    if (existing) {
      db.prepare(
        `UPDATE match_review_queue
         SET sourceId = COALESCE(?, sourceId),
             currentImdbId = COALESCE(?, currentImdbId),
             score = COALESCE(?, score),
             llmVerdict = COALESCE(?, llmVerdict),
             llmConfidence = COALESCE(?, llmConfidence),
             llmReason = COALESCE(?, llmReason),
             flagsJson = ?,
             candidateJson = COALESCE(?, candidateJson)
         WHERE id = ?`
      ).run(
        item.sourceId ?? null,
        item.currentImdbId ?? null,
        item.score ?? null,
        item.llmVerdict ?? null,
        item.llmConfidence ?? null,
        item.llmReason ?? null,
        flagsJson,
        candidateJson,
        existing.id
      )
      return { id: existing.id, inserted: false }
    }
  }

  const info = db
    .prepare(
      `INSERT INTO match_review_queue (
        movieId, kind, sourceId, currentImdbId, proposedImdbId,
        score, llmVerdict, llmConfidence, llmReason, flagsJson, candidateJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(movieId, kind, proposedImdbId) DO UPDATE SET
        sourceId = COALESCE(excluded.sourceId, match_review_queue.sourceId),
        currentImdbId = COALESCE(excluded.currentImdbId, match_review_queue.currentImdbId),
        score = COALESCE(excluded.score, match_review_queue.score),
        llmVerdict = COALESCE(excluded.llmVerdict, match_review_queue.llmVerdict),
        llmConfidence = COALESCE(excluded.llmConfidence, match_review_queue.llmConfidence),
        llmReason = COALESCE(excluded.llmReason, match_review_queue.llmReason),
        flagsJson = excluded.flagsJson,
        candidateJson = COALESCE(excluded.candidateJson, match_review_queue.candidateJson)`
    )
    .run(
      item.movieId,
      item.kind,
      item.sourceId ?? null,
      item.currentImdbId ?? null,
      proposedImdbId,
      item.score ?? null,
      item.llmVerdict ?? null,
      item.llmConfidence ?? null,
      item.llmReason ?? null,
      flagsJson,
      candidateJson
    )

  const row = db
    .prepare(
      `SELECT id FROM match_review_queue
       WHERE movieId = ? AND kind = ? AND proposedImdbId IS ?
       LIMIT 1`
    )
    .get(item.movieId, item.kind, proposedImdbId) as { id: number } | undefined

  return {
    id: row?.id ?? Number(info.lastInsertRowid),
    inserted: info.changes > 0,
  }
}

export function listReviewItems(
  db: Database.Database,
  filter: ReviewQueueFilter = {}
): { items: MatchReviewQueueRow[]; total: number } {
  ensureMatchReviewQueueTable(db)

  const where: string[] = []
  const params: unknown[] = []

  if (filter.status && filter.status !== 'all') {
    where.push('status = ?')
    params.push(filter.status)
  }
  if (filter.kind && filter.kind !== 'all') {
    where.push('kind = ?')
    params.push(filter.kind)
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.max(1, Math.min(500, filter.limit ?? 50))
  const offset = Math.max(0, filter.offset ?? 0)

  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM match_review_queue ${whereClause}`)
    .get(...params) as { cnt: number }

  const items = db
    .prepare(
      `SELECT * FROM match_review_queue ${whereClause}
       ORDER BY createdAt DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as MatchReviewQueueRow[]

  return { items, total: countRow.cnt }
}

export function getReviewQueueStats(db: Database.Database): ReviewQueueStats {
  ensureMatchReviewQueueTable(db)

  const statusRows = db
    .prepare('SELECT status, COUNT(*) as cnt FROM match_review_queue GROUP BY status')
    .all() as Array<{ status: ReviewStatus; cnt: number }>

  const kindRows = db
    .prepare(
      "SELECT kind, COUNT(*) as cnt FROM match_review_queue WHERE status = 'pending' GROUP BY kind"
    )
    .all() as Array<{ kind: ReviewKind; cnt: number }>

  const stats: ReviewQueueStats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    resolved: 0,
    byKind: {
      new_match: 0,
      false_hit: 0,
      archive_preview: 0,
    },
  }

  for (const row of statusRows) {
    stats.total += row.cnt
    if (row.status in stats) {
      stats[row.status] = row.cnt
    }
  }

  for (const row of kindRows) {
    if (row.kind in stats.byKind) {
      stats.byKind[row.kind] = row.cnt
    }
  }

  return stats
}

export function resolveReviewItem(
  db: Database.Database,
  id: number,
  status: 'approved' | 'rejected' | 'resolved'
): MatchReviewQueueRow | null {
  ensureMatchReviewQueueTable(db)

  db.prepare(
    `UPDATE match_review_queue
     SET status = ?, resolvedAt = datetime('now')
     WHERE id = ?`
  ).run(status, id)

  const updated = db.prepare('SELECT * FROM match_review_queue WHERE id = ?').get(id) as
    | MatchReviewQueueRow
    | undefined

  return updated ?? null
}
