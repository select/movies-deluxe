/**
 * Deduplication API Endpoint
 *
 * Detects and merges duplicate movie entries in the database.
 * Handles exact title matches, fuzzy similarity, same IMDB ID with different keys.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { normalizeTitleForComparison } from '../../../../shared/utils/movieTitle'

interface DeduplicateOptions {
  dryRun?: boolean
  threshold?: number
  reportOnly?: boolean
}

interface DeduplicateResult {
  titleGroups: number
  imdbIdGroups: number
  mergedCount: number
  removedCount: number
  totalMovies: number
  groups?: Array<{
    type: 'title' | 'imdbId'
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
 * Find duplicate groups by title similarity
 */
function findDuplicateGroups(
  entries: Array<[string, MovieEntry]>,
  threshold: number
): Array<Array<[string, MovieEntry]>> {
  const groups: Array<Array<[string, MovieEntry]>> = []
  const processed = new Set<string>()

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    const [key1, entry1] = entry
    if (processed.has(key1)) continue

    const group: Array<[string, MovieEntry]> = [[key1, entry1]]
    processed.add(key1)
    const normalized1 = normalizeTitleForComparison(entry1.title)

    for (let j = i + 1; j < entries.length; j++) {
      const entry2 = entries[j]
      if (!entry2) continue
      const [key2, entry2Data] = entry2
      if (processed.has(key2)) continue

      const normalized2 = normalizeTitleForComparison(entry2Data.title)
      const similarity = similarityRatio(normalized1, normalized2)

      if (similarity >= threshold) {
        group.push([key2, entry2Data])
        processed.add(key2)
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
  entries: Array<[string, MovieEntry]>
): Array<Array<[string, MovieEntry]>> {
  const imdbIdMap = new Map<string, Array<[string, MovieEntry]>>()

  for (const [key, entry] of entries) {
    if (entry.imdbId.startsWith('tt')) {
      const existing = imdbIdMap.get(entry.imdbId) || []
      existing.push([key, entry])
      imdbIdMap.set(entry.imdbId, existing)
    }
  }

  return Array.from(imdbIdMap.values()).filter(group => group.length > 1)
}

/**
 * Merge sources from multiple entries
 */
function mergeSources(entries: Array<[string, MovieEntry]>): MovieSource[] {
  const sources: MovieSource[] = []
  const seen = new Set<string>()

  for (const [_, entry] of entries) {
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
function chooseBestEntry(entries: Array<[string, MovieEntry]>): [string, MovieEntry] {
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
    const [_, movieEntry] = entry
    let score = 0

    if (movieEntry.imdbId.startsWith('tt')) score += 100
    if (movieEntry.metadata) score += 50
    score += movieEntry.sources.length * 5
    if (movieEntry.year) score += 10

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
function mergeGroup(group: Array<[string, MovieEntry]>): {
  key: string
  entry: MovieEntry
  merged: string[]
} {
  const bestResult = chooseBestEntry(group)
  if (!bestResult) {
    throw new Error('chooseBestEntry returned undefined')
  }
  const [bestKey, bestEntry] = bestResult
  const mergedSources = mergeSources(group)
  const merged = group.map(([key]) => key).filter(key => key !== bestKey)

  const mergedEntry: MovieEntry = {
    ...bestEntry,
    sources: mergedSources,
    lastUpdated: new Date().toISOString(),
  }

  return { key: bestKey, entry: mergedEntry, merged }
}

/**
 * Apply deduplication to database
 */
function applyDeduplication(
  database: MoviesDatabase,
  allGroups: Array<Array<[string, MovieEntry]>>
): { database: MoviesDatabase; mergedCount: number; removedCount: number } {
  let mergedCount = 0
  let removedCount = 0

  for (const group of allGroups) {
    const { key, entry, merged } = mergeGroup(group)
    database[key] = entry
    mergedCount++

    for (const removedKey of merged) {
      delete database[removedKey]
      removedCount++
    }
  }

  return { database, mergedCount, removedCount }
}

export default defineEventHandler(async event => {
  const body = await readBody<DeduplicateOptions>(event)
  const { dryRun = false, threshold = 0.85, reportOnly = false } = body || {}

  try {
    const database = await loadMoviesDatabase()
    const entries = Object.entries(database)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => [key, value as MovieEntry] as [string, MovieEntry])

    const imdbIdGroups = findSameImdbIdGroups(entries)
    const titleGroups = findDuplicateGroups(entries, threshold)
    const allGroups = [...imdbIdGroups, ...titleGroups]

    const result: DeduplicateResult = {
      titleGroups: titleGroups.length,
      imdbIdGroups: imdbIdGroups.length,
      mergedCount: 0,
      removedCount: 0,
      totalMovies: entries.length,
    }

    if (reportOnly) {
      result.groups = allGroups.map(group => ({
        type: imdbIdGroups.includes(group) ? 'imdbId' : 'title',
        entries: group.map(([id, entry]) => ({
          id,
          title: entry.title,
          sources: entry.sources.length,
        })),
      }))
      return result
    }

    if (allGroups.length === 0) {
      return result
    }

    if (!dryRun) {
      const {
        database: updatedDatabase,
        mergedCount,
        removedCount,
      } = applyDeduplication(database, allGroups)
      await saveMoviesDatabase(updatedDatabase)
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
