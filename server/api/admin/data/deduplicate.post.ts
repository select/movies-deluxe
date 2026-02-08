/**
 * Deduplication API Endpoint
 *
 * Detects and merges duplicate movie entries in the database.
 * Handles exact title matches, fuzzy similarity, same IMDB ID with different keys.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { normalizeTitleForComparison } from '../../../../shared/utils/movieTitle'
import { getAdminDatabase, withTransaction } from '../../../utils/adminDb'
import type { MovieEntry, MovieSource } from '../../../../shared/types/movie'
import type Database from 'better-sqlite3'

interface DeduplicateOptions {
  dryRun?: boolean
  threshold?: number
  reportOnly?: boolean
}

interface DeduplicateResult {
  titleGroups: number
  movieIdGroups: number
  mergedCount: number
  removedCount: number
  totalMovies: number
  groups?: Array<{
    type: 'title' | 'movieId'
    entries: Array<{ id: string; title: string; sources: number }>
  }>
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      )
    }
  }

  return matrix[len1]![len2]!
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function similarityRatio(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  const maxLen = Math.max(str1.length, str2.length)
  return maxLen === 0 ? 1 : 1 - distance / maxLen
}

/**
 * Load movie entry from database
 */
function loadMovieEntry(db: Database.Database, movieId: string): MovieEntry | null {
  const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
    | { movieId: string; title: string; year: number | null; verified: number; lastUpdated: string }
    | undefined

  if (!movie) return null

  // Load sources
  const sources = db
    .prepare(
      `
      SELECT s.*, c.platform as type, c.name as channelName
      FROM sources s
      JOIN channels c ON s.channelId = c.id
      WHERE s.movieId = ?
    `
    )
    .all(movieId) as Array<{
    id: number
    sourceId: string
    channelId: string
    type: string
    channelName: string
  }>

  // Load metadata
  const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(movieId) as
    | Record<string, unknown>
    | undefined

  return {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year || undefined,
    sources: sources.map(s => ({
      id: s.sourceId,
      sourceId: s.sourceId,
      channelId: s.channelId,
      type: s.type as 'archive.org' | 'youtube',
      channelName: s.channelName,
      addedAt: 0,
    })),
    metadata: metadata || undefined,
    verified: movie.verified === 1,
    lastUpdated: movie.lastUpdated,
  }
}

/**
 * Find duplicate groups by title similarity
 */
function findDuplicateGroups(
  db: Database.Database,
  entries: Array<{ movieId: string; title: string }>,
  threshold: number
): Array<Array<{ movieId: string; entry: MovieEntry }>> {
  const groups: Array<Array<{ movieId: string; entry: MovieEntry }>> = []
  const processed = new Set<string>()

  for (let i = 0; i < entries.length; i++) {
    const entry1 = entries[i]
    if (!entry1) continue
    if (processed.has(entry1.movieId)) continue

    const group: Array<{ movieId: string; entry: MovieEntry }> = []
    const entry1Data = loadMovieEntry(db, entry1.movieId)
    if (!entry1Data) continue

    group.push({ movieId: entry1.movieId, entry: entry1Data })
    processed.add(entry1.movieId)
    const normalized1 = normalizeTitleForComparison(entry1.title)

    for (let j = i + 1; j < entries.length; j++) {
      const entry2 = entries[j]
      if (!entry2) continue
      if (processed.has(entry2.movieId)) continue

      const normalized2 = normalizeTitleForComparison(entry2.title)
      const similarity = similarityRatio(normalized1, normalized2)

      if (similarity >= threshold) {
        const entry2Data = loadMovieEntry(db, entry2.movieId)
        if (entry2Data) {
          group.push({ movieId: entry2.movieId, entry: entry2Data })
          processed.add(entry2.movieId)
        }
      }
    }

    if (group.length > 1) {
      groups.push(group)
    }
  }

  return groups
}

/**
 * Find entries with same IMDB ID but different keys
 */
function findSameImdbIdGroups(
  db: Database.Database
): Array<Array<{ movieId: string; entry: MovieEntry }>> {
  // Find movieIds that appear more than once
  const duplicates = db
    .prepare(
      `
      SELECT movieId, COUNT(*) as count
      FROM movies
      WHERE movieId LIKE 'tt%'
      GROUP BY movieId
      HAVING count > 1
    `
    )
    .all() as Array<{ movieId: string; count: number }>

  const groups: Array<Array<{ movieId: string; entry: MovieEntry }>> = []

  for (const dup of duplicates) {
    const entries: Array<{ movieId: string; entry: MovieEntry }> = []
    const entry = loadMovieEntry(db, dup.movieId)
    if (entry) {
      entries.push({ movieId: dup.movieId, entry })
    }
    if (entries.length > 1) {
      groups.push(entries)
    }
  }

  return groups
}

/**
 * Merge sources from multiple entries
 */
function mergeSources(entries: Array<{ movieId: string; entry: MovieEntry }>): MovieSource[] {
  const sources: MovieSource[] = []
  const seen = new Set<string>()

  for (const { entry } of entries) {
    for (const source of entry.sources) {
      const key = source.type === 'archive.org' ? `archive:${source.id}` : `youtube:${source.id}`

      if (!seen.has(key)) {
        sources.push(source)
        seen.add(key)
      }
    }
  }

  return sources
}

/**
 * Choose the best entry from a group
 */
function chooseBestEntry(
  entries: Array<{ movieId: string; entry: MovieEntry }>
): { movieId: string; entry: MovieEntry } {
  if (entries.length === 0) {
    throw new Error('Cannot choose best entry from empty array')
  }

  const firstEntry = entries[0]
  if (!firstEntry) {
    throw new Error('First entry is undefined')
  }

  let best = firstEntry
  let bestScore = 0

  for (const entry of entries) {
    let score = 0

    if (entry.entry.movieId.startsWith('tt')) score += 100
    if (entry.entry.metadata) score += 50
    score += entry.entry.sources.length * 5
    if (entry.entry.year) score += 10

    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  return best
}

/**
 * Merge a group of duplicate entries
 */
function mergeGroup(group: Array<{ movieId: string; entry: MovieEntry }>): {
  movieId: string
  entry: MovieEntry
  merged: string[]
} {
  const bestResult = chooseBestEntry(group)
  if (!bestResult) {
    throw new Error('chooseBestEntry returned undefined')
  }
  const bestKey = bestResult.movieId
  const bestEntry = bestResult.entry
  const mergedSources = mergeSources(group)
  const merged = group.map(g => g.movieId).filter(id => id !== bestKey)

  const mergedEntry: MovieEntry = {
    ...bestEntry,
    sources: mergedSources,
    lastUpdated: new Date().toISOString(),
  }

  return { movieId: bestKey, entry: mergedEntry, merged }
}

/**
 * Delete a movie from the database
 */
function deleteMovie(db: Database.Database, movieId: string): void {
  // Delete from collection_movies
  db.prepare('DELETE FROM collection_movies WHERE movieId = ?').run(movieId)

  // Delete quality marks for all sources
  db.prepare(
    `
    DELETE FROM source_quality_marks 
    WHERE sourceId IN (SELECT id FROM sources WHERE movieId = ?)
  `
  ).run(movieId)

  // Delete sources
  db.prepare('DELETE FROM sources WHERE movieId = ?').run(movieId)

  // Delete metadata
  db.prepare('DELETE FROM metadata WHERE movieId = ?').run(movieId)

  // Delete AI metadata
  db.prepare('DELETE FROM ai_metadata WHERE movieId = ?').run(movieId)

  // Delete related movies
  db.prepare('DELETE FROM related_movies WHERE movieId = ? OR relatedMovieId = ?').run(
    movieId,
    movieId
  )

  // Delete movie
  db.prepare('DELETE FROM movies WHERE movieId = ?').run(movieId)
}

/**
 * Apply deduplication to database using SQL
 */
async function applyDeduplication(
  db: Database.Database,
  allGroups: Array<Array<{ movieId: string; entry: MovieEntry }>>
): Promise<{ mergedCount: number; removedCount: number }> {
  let mergedCount = 0
  let removedCount = 0

  for (const group of allGroups) {
    const { movieId, entry, merged } = mergeGroup(group)

    // Update the best movie with merged sources
    const { upsertMovie } = await import('../../../utils/upsertMovie')
    await upsertMovie(movieId, entry)
    mergedCount++

    // Delete merged movies
    for (const removedId of merged) {
      deleteMovie(db, removedId)
      removedCount++
    }
  }

  return { mergedCount, removedCount }
}

export default defineEventHandler(async event => {
  const body = await readBody<DeduplicateOptions>(event)
  const { dryRun = false, threshold = 0.85, reportOnly = false } = body || {}

  try {
    const db = getAdminDatabase()

    // Get all movies
    const movies = db
      .prepare('SELECT movieId, title FROM movies ORDER BY movieId')
      .all() as Array<{ movieId: string; title: string }>

    const movieIdGroups = findSameImdbIdGroups(db)
    const titleGroups = findDuplicateGroups(db, movies, threshold)
    const allGroups = [...movieIdGroups, ...titleGroups]

    const result: DeduplicateResult = {
      titleGroups: titleGroups.length,
      movieIdGroups: movieIdGroups.length,
      mergedCount: 0,
      removedCount: 0,
      totalMovies: movies.length,
    }

    if (reportOnly) {
      result.groups = allGroups.map(group => ({
        type: movieIdGroups.includes(group) ? 'movieId' : 'title',
        entries: group.map(g => ({
          id: g.movieId,
          title: g.entry.title,
          sources: g.entry.sources.length,
        })),
      }))
      return result
    }

    if (allGroups.length === 0) {
      return result
    }

    if (!dryRun) {
      const { mergedCount, removedCount } = await withTransaction(async txDb => {
        return await applyDeduplication(txDb, allGroups)
      })
      result.mergedCount = mergedCount
      result.removedCount = removedCount
    } else {
      result.mergedCount = allGroups.length
      result.removedCount = allGroups.reduce((sum, group) => sum + group.length - 1, 0)
    }

    return result
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Deduplication failed',
    })
  }
})
