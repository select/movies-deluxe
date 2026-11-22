/**
 * Local IMDb SQLite Index Reader
 *
 * Read-only better-sqlite3 reader for data/imdb-index.db (built by scripts/build-imdb-index.ts).
 * Gracefully returns empty results and false availability when the index is not built.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_DB_PATH = join(process.cwd(), 'data', 'imdb-index.db')

let indexDb: Database.Database | null = null
let checkedAvailability: boolean | null = null

export interface ImdbLocalMovie {
  imdbId: string
  title: string
  originalTitle?: string
  altTitles: string[]
  year?: number
  runtimeMinutes?: number
  titleType?: string
  directors: string[]
  cast: string[]
}

export type ImdbLocalCandidate = ImdbLocalMovie

function getIndexDatabase(): Database.Database | null {
  if (!existsSync(DEFAULT_DB_PATH)) {
    indexDb = null
    checkedAvailability = false
    return null
  }

  if (indexDb) {
    return indexDb
  }

  try {
    const db = new Database(DEFAULT_DB_PATH, { readonly: true, fileMustExist: true })
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='titles'")
      .get() as { name: string } | undefined

    if (!table) {
      db.close()
      checkedAvailability = false
      return null
    }

    indexDb = db
    checkedAvailability = true
    return indexDb
  } catch (error) {
    console.warn('[ImdbLocalIndex] Failed to open index database:', error)
    indexDb = null
    checkedAvailability = false
    return null
  }
}

/**
 * Check if data/imdb-index.db exists and is readable
 */
export function isImdbLocalIndexAvailable(): boolean {
  if (!existsSync(DEFAULT_DB_PATH)) {
    return false
  }
  if (checkedAvailability === true && indexDb) {
    return true
  }
  return getIndexDatabase() !== null
}

/**
 * Sanitize free-form title text into a safe FTS5 query string
 */
function buildFtsQuery(query: string): string | null {
  const tokens = query
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.trim())
    .filter(t => t.length > 0)

  if (tokens.length === 0) {
    return null
  }

  return tokens.map(token => `"${token.replace(/"/g, '""')}"`).join(' ')
}

interface TitleRow {
  tconst: string
  titleType: string | null
  primaryTitle: string | null
  originalTitle: string | null
  startYear: number | null
  runtimeMinutes: number | null
}

function hydrateTitleRow(db: Database.Database, row: TitleRow): ImdbLocalMovie {
  const primaryTitle = row.primaryTitle || row.originalTitle || ''

  const akaRows = db
    .prepare('SELECT DISTINCT title FROM akas WHERE titleId = ? LIMIT 25')
    .all(row.tconst) as Array<{ title: string }>

  const altTitlesSet = new Set<string>()
  if (row.originalTitle && row.originalTitle !== primaryTitle) {
    altTitlesSet.add(row.originalTitle)
  }
  for (const aka of akaRows) {
    if (aka.title && aka.title !== primaryTitle) {
      altTitlesSet.add(aka.title)
    }
  }

  const principalRows = db
    .prepare(
      `
      SELECT p.category, n.primaryName
      FROM principals p
      JOIN names n ON p.nconst = n.nconst
      WHERE p.tconst = ?
      ORDER BY p.ordering ASC
      LIMIT 20
    `
    )
    .all(row.tconst) as Array<{ category: string; primaryName: string }>

  const directors: string[] = []
  const cast: string[] = []

  for (const p of principalRows) {
    if (p.category === 'director') {
      if (!directors.includes(p.primaryName)) {
        directors.push(p.primaryName)
      }
    } else if (p.category === 'actor' || p.category === 'actress') {
      if (!cast.includes(p.primaryName) && cast.length < 10) {
        cast.push(p.primaryName)
      }
    }
  }

  return {
    imdbId: row.tconst,
    title: primaryTitle,
    originalTitle: row.originalTitle || undefined,
    altTitles: Array.from(altTitlesSet),
    year: row.startYear ?? undefined,
    runtimeMinutes: row.runtimeMinutes ?? undefined,
    titleType: row.titleType || undefined,
    directors,
    cast,
  }
}

/**
 * Look up a single IMDb title by ID in the local index
 */
export function getImdbLocalById(imdbId: string): ImdbLocalMovie | null {
  const db = getIndexDatabase()
  if (!db) return null

  const normalizedId = imdbId.trim().toLowerCase()
  if (!/^tt\d{7,9}$/.test(normalizedId)) {
    return null
  }

  try {
    const row = db
      .prepare(
        `
        SELECT tconst, titleType, primaryTitle, originalTitle, startYear, runtimeMinutes
        FROM titles
        WHERE tconst = ?
      `
      )
      .get(normalizedId) as TitleRow | undefined

    if (!row) return null
    return hydrateTitleRow(db, row)
  } catch (error) {
    console.warn(`[ImdbLocalIndex] Error looking up ${normalizedId}:`, error)
    return null
  }
}

/**
 * Search the local IMDb FTS5 index by title and optional year
 */
export function searchImdbLocalIndex(
  query: string,
  year?: number,
  limit = 10
): ImdbLocalCandidate[] {
  const db = getIndexDatabase()
  if (!db) return []

  const ftsQuery = buildFtsQuery(query)
  if (!ftsQuery) return []

  const maxResults = Math.max(1, Math.min(limit, 50))
  const fetchLimit = maxResults * 4

  try {
    const rows = year
      ? (db
          .prepare(
            `
            SELECT DISTINCT
              t.tconst,
              t.titleType,
              t.primaryTitle,
              t.originalTitle,
              t.startYear,
              t.runtimeMinutes
            FROM titles_fts f
            JOIN titles t ON t.tconst = f.tconst
            WHERE titles_fts MATCH ?
            ORDER BY
              CASE
                WHEN t.startYear = ? THEN 0
                WHEN t.startYear IS NOT NULL AND ABS(t.startYear - ?) <= 2 THEN 1
                ELSE 2
              END,
              CASE WHEN t.titleType = 'movie' THEN 0 ELSE 1 END,
              bm25(titles_fts)
            LIMIT ?
          `
          )
          .all(ftsQuery, year, year, fetchLimit) as TitleRow[])
      : (db
          .prepare(
            `
            SELECT DISTINCT
              t.tconst,
              t.titleType,
              t.primaryTitle,
              t.originalTitle,
              t.startYear,
              t.runtimeMinutes
            FROM titles_fts f
            JOIN titles t ON t.tconst = f.tconst
            WHERE titles_fts MATCH ?
            ORDER BY
              CASE WHEN t.titleType = 'movie' THEN 0 ELSE 1 END,
              bm25(titles_fts)
            LIMIT ?
          `
          )
          .all(ftsQuery, fetchLimit) as TitleRow[])

    const seen = new Set<string>()
    const results: ImdbLocalCandidate[] = []

    for (const row of rows) {
      if (seen.has(row.tconst)) continue
      seen.add(row.tconst)
      results.push(hydrateTitleRow(db, row))
      if (results.length >= maxResults) break
    }

    return results
  } catch (error) {
    console.warn(`[ImdbLocalIndex] FTS search error for "${query}":`, error)
    return []
  }
}
