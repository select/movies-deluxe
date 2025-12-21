#!/usr/bin/env tsx

/**
 * Movie Deduplication Script
 *
 * Detects and merges duplicate movie entries in the database.
 * Handles:
 * - Exact title matches
 * - Fuzzy title similarity
 * - Same IMDB ID with different keys
 * - Source consolidation
 * - Conflict resolution
 *
 * Usage:
 *   pnpm deduplicate                    # Run deduplication
 *   pnpm deduplicate --dry-run          # Preview without saving
 *   pnpm deduplicate --threshold 0.8    # Set similarity threshold (0-1)
 *   pnpm deduplicate --report           # Generate detailed report only
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MovieEntry, MoviesDatabase, MovieSource } from '../types/movie'
import { createLogger } from './utils/logger'

const logger = createLogger('deduplicate')

const DATA_FILE = resolve(process.cwd(), 'data/movies.json')

// Parse command line arguments
interface CliOptions {
  dryRun: boolean
  threshold: number
  report: boolean
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2)
  const thresholdIndex = args.indexOf('--threshold')

  return {
    dryRun: args.includes('--dry-run'),
    threshold: thresholdIndex !== -1 ? parseFloat(args[thresholdIndex + 1]) : 0.85,
    report: args.includes('--report'),
  }
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
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[len1][len2]
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
 * Normalize title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
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
    const [key1, entry1] = entries[i]

    if (processed.has(key1)) continue

    const group: Array<[string, MovieEntry]> = [[key1, entry1]]
    processed.add(key1)

    const normalized1 = normalizeTitle(entry1.title)

    for (let j = i + 1; j < entries.length; j++) {
      const [key2, entry2] = entries[j]

      if (processed.has(key2)) continue

      const normalized2 = normalizeTitle(entry2.title)
      const similarity = similarityRatio(normalized1, normalized2)

      if (similarity >= threshold) {
        group.push([key2, entry2])
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
    // Only check entries with real IMDB IDs
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
      const key =
        source.type === 'archive.org' ? `archive:${source.identifier}` : `youtube:${source.videoId}`

      if (!seen.has(key)) {
        sources.push(source)
        seen.add(key)
      }
    }
  }

  return sources
}

/**
 * Choose the best entry from a group (most complete metadata)
 */
function chooseBestEntry(entries: Array<[string, MovieEntry]>): [string, MovieEntry] {
  let best = entries[0]
  let bestScore = 0

  for (const entry of entries) {
    const [_, movieEntry] = entry
    let score = 0

    // Prefer entries with IMDB IDs
    if (movieEntry.imdbId.startsWith('tt')) score += 100

    // Prefer entries with OMDB metadata
    if (movieEntry.metadata) score += 50

    // Prefer entries with AI metadata
    if (movieEntry.ai) score += 25

    // Prefer entries with more sources
    score += movieEntry.sources.length * 5

    // Prefer entries with year
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
  const [bestKey, bestEntry] = chooseBestEntry(group)
  const mergedSources = mergeSources(group)

  // Collect all keys that will be merged
  const merged = group.map(([key]) => key).filter(key => key !== bestKey)

  // Create merged entry
  const mergedEntry: MovieEntry = {
    ...bestEntry,
    sources: mergedSources,
    lastUpdated: new Date().toISOString(),
  }

  return {
    key: bestKey,
    entry: mergedEntry,
    merged,
  }
}

/**
 * Generate deduplication report
 */
function generateReport(
  titleGroups: Array<Array<[string, MovieEntry]>>,
  imdbIdGroups: Array<Array<[string, MovieEntry]>>
): void {
  logger.info('\n=== Deduplication Report ===\n')

  if (titleGroups.length === 0 && imdbIdGroups.length === 0) {
    logger.success('No duplicates found!')
    return
  }

  if (imdbIdGroups.length > 0) {
    logger.info(`Found ${imdbIdGroups.length} groups with same IMDB ID:\n`)

    for (const group of imdbIdGroups) {
      logger.info(`IMDB ID: ${group[0][1].imdbId}`)
      for (const [key, entry] of group) {
        logger.info(`  - ${key}: "${entry.title}" (${entry.sources.length} sources)`)
      }
      logger.info('')
    }
  }

  if (titleGroups.length > 0) {
    logger.info(`Found ${titleGroups.length} groups with similar titles:\n`)

    for (const group of titleGroups) {
      const [_, firstEntry] = group[0]
      logger.info(`Similar to: "${firstEntry.title}"`)
      for (const [key, entry] of group) {
        const similarity = similarityRatio(
          normalizeTitle(firstEntry.title),
          normalizeTitle(entry.title)
        )
        logger.info(
          `  - ${key}: "${entry.title}" (similarity: ${(similarity * 100).toFixed(1)}%, ${entry.sources.length} sources)`
        )
      }
      logger.info('')
    }
  }
}

/**
 * Apply deduplication to database
 */
function applyDeduplication(
  database: MoviesDatabase,
  allGroups: Array<Array<[string, MovieEntry]>>
): {
  database: MoviesDatabase
  mergedCount: number
  removedCount: number
} {
  let mergedCount = 0
  let removedCount = 0

  for (const group of allGroups) {
    const { key, entry, merged } = mergeGroup(group)

    // Update the best entry
    database[key] = entry
    mergedCount++

    // Remove merged entries
    for (const removedKey of merged) {
      delete database[removedKey]
      removedCount++
    }

    logger.info(`Merged ${merged.length + 1} entries into ${key}:`)
    logger.info(`  Title: "${entry.title}"`)
    logger.info(`  Sources: ${entry.sources.length}`)
    logger.info(`  Removed: ${merged.join(', ')}`)
    logger.info('')
  }

  return { database, mergedCount, removedCount }
}

/**
 * Load movies database
 */
function loadMoviesDatabase(): MoviesDatabase {
  try {
    const data = readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    throw new Error(`Failed to load movies database from ${DATA_FILE}: ${error}`)
  }
}

/**
 * Save movies database
 */
function saveMoviesDatabase(database: MoviesDatabase): void {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(database, null, 2) + '\n', 'utf-8')
    logger.success(`Saved updated database to ${DATA_FILE}`)
  } catch (error) {
    throw new Error(`Failed to save database: ${error}`)
  }
}

/**
 * Main execution
 */
async function main() {
  const options = parseCliArgs()

  logger.info('Starting movie deduplication...')
  logger.info(`Similarity threshold: ${(options.threshold * 100).toFixed(0)}%`)

  // Load database
  const database = loadMoviesDatabase()

  // Get all movie entries (exclude schema and example)
  const entries = Object.entries(database)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => [key, value as MovieEntry] as [string, MovieEntry])

  logger.info(`Loaded ${entries.length} movies from database`)

  // Find duplicates by IMDB ID
  const imdbIdGroups = findSameImdbIdGroups(entries)

  // Find duplicates by title similarity
  const titleGroups = findDuplicateGroups(entries, options.threshold)

  // Generate report
  generateReport(titleGroups, imdbIdGroups)

  if (options.report) {
    return
  }

  // Combine all groups
  const allGroups = [...imdbIdGroups, ...titleGroups]

  if (allGroups.length === 0) {
    logger.success('No duplicates to merge!')
    return
  }

  if (options.dryRun) {
    logger.info('\n=== DRY RUN - No changes will be saved ===')
    logger.info(`Would merge ${allGroups.length} groups`)
    return
  }

  // Apply deduplication
  logger.info('\n=== Applying Deduplication ===\n')
  const {
    database: updatedDatabase,
    mergedCount,
    removedCount,
  } = applyDeduplication(database, allGroups)

  // Save updated database
  saveMoviesDatabase(updatedDatabase)

  logger.success('\n=== Deduplication Complete ===')
  logger.success(`Merged: ${mergedCount} entries`)
  logger.success(`Removed: ${removedCount} duplicate entries`)
  logger.success(`Total movies: ${entries.length - removedCount}`)
}

// Run the script
main().catch(error => {
  logger.error(`Script failed: ${error}`)
  process.exit(1)
})
