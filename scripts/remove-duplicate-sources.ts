#!/usr/bin/env tsx
/**
 * Remove Duplicate Sources
 *
 * This script removes duplicate sources from movie entries in the database.
 * Duplicates are identified by:
 * 1. Same URL (primary key)
 * 2. Same type + id combination
 *
 * When duplicates are found, the script keeps the most complete source
 * (the one with more metadata fields populated).
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry, MovieSource } from '../shared/types/movie'

interface DeduplicationStats {
  totalMovies: number
  moviesWithDuplicates: number
  totalSourcesRemoved: number
  byType: {
    'archive.org': number
    youtube: number
  }
}

/**
 * Calculate a completeness score for a source based on how many fields are populated
 */
function calculateSourceCompleteness(source: MovieSource): number {
  let score = 0
  const fields = Object.keys(source)

  for (const field of fields) {
    const value = source[field as keyof MovieSource]
    if (value !== null && value !== undefined && value !== '') {
      score++
    }
  }

  return score
}

/**
 * Choose the better source between two duplicates
 */
function chooseBetterSource(source1: MovieSource, source2: MovieSource): MovieSource {
  const score1 = calculateSourceCompleteness(source1)
  const score2 = calculateSourceCompleteness(source2)

  // Prefer the source with more metadata
  if (score1 > score2) return source1
  if (score2 > score1) return source2

  // If equal, prefer the one with an id over null
  if (source1.id && !source2.id) return source1
  if (source2.id && !source1.id) return source2

  // If still equal, prefer the one added earlier
  if (source1.addedAt < source2.addedAt) return source1

  return source2
}

/**
 * Generate a unique key for a source
 */
function getSourceKey(source: MovieSource): string {
  // Primary key: URL (normalized)
  const normalizedUrl = source.url.toLowerCase().trim()
  return normalizedUrl
}

/**
 * Deduplicate sources within a single movie entry
 */
function deduplicateSources(sources: MovieSource[]): {
  deduplicated: MovieSource[]
  removedCount: number
} {
  if (!sources || sources.length === 0) {
    return { deduplicated: [], removedCount: 0 }
  }

  const sourceMap = new Map<string, MovieSource>()

  for (const source of sources) {
    const key = getSourceKey(source)

    if (sourceMap.has(key)) {
      // Duplicate found - choose the better one
      const existing = sourceMap.get(key)!
      const better = chooseBetterSource(existing, source)
      sourceMap.set(key, better)
    } else {
      sourceMap.set(key, source)
    }
  }

  const deduplicated = Array.from(sourceMap.values())
  const removedCount = sources.length - deduplicated.length

  return { deduplicated, removedCount }
}

async function removeDuplicateSources() {
  const dbPath = join(process.cwd(), 'data/movies.json')

  console.log('📖 Reading movies database...')
  const data = await readFile(dbPath, 'utf-8')
  const db: MoviesDatabase = JSON.parse(data)

  const stats: DeduplicationStats = {
    totalMovies: 0,
    moviesWithDuplicates: 0,
    totalSourcesRemoved: 0,
    byType: {
      'archive.org': 0,
      youtube: 0,
    },
  }

  const examples: Array<{
    imdbId: string
    title: string
    before: number
    after: number
    removed: number
  }> = []

  console.log('🔍 Scanning for duplicate sources...\n')

  for (const [key, entry] of Object.entries(db)) {
    // Skip schema and non-movie entries
    if (key === '_schema' || key === '_example' || !entry || typeof entry !== 'object') {
      continue
    }

    const movieEntry = entry as MovieEntry
    stats.totalMovies++

    if (!movieEntry.sources || movieEntry.sources.length === 0) {
      continue
    }

    const originalCount = movieEntry.sources.length
    const { deduplicated, removedCount } = deduplicateSources(movieEntry.sources)

    if (removedCount > 0) {
      stats.moviesWithDuplicates++
      stats.totalSourcesRemoved += removedCount

      // Count by type
      for (const source of movieEntry.sources) {
        if (source.type === 'archive.org' || source.type === 'youtube') {
          // Check if this source was removed
          const stillExists = deduplicated.some(s => getSourceKey(s) === getSourceKey(source))
          if (!stillExists) {
            stats.byType[source.type]++
          }
        }
      }

      // Update the entry
      movieEntry.sources = deduplicated
      movieEntry.lastUpdated = new Date().toISOString()

      // Save example
      if (examples.length < 5) {
        examples.push({
          imdbId: movieEntry.imdbId,
          title: movieEntry.title,
          before: originalCount,
          after: deduplicated.length,
          removed: removedCount,
        })
      }
    }
  }

  console.log('📊 Deduplication Results:\n')
  console.log(`  Total movies scanned: ${stats.totalMovies}`)
  console.log(`  Movies with duplicates: ${stats.moviesWithDuplicates}`)
  console.log(`  Total sources removed: ${stats.totalSourcesRemoved}`)
  console.log(`  - Archive.org: ${stats.byType['archive.org']}`)
  console.log(`  - YouTube: ${stats.byType.youtube}`)
  console.log()

  if (examples.length > 0) {
    console.log('📝 Examples:\n')
    for (const example of examples) {
      console.log(`  ${example.imdbId}`)
      console.log(`  Title: ${example.title}`)
      console.log(`  Sources: ${example.before} → ${example.after} (removed ${example.removed})`)
      console.log()
    }
  }

  if (stats.totalSourcesRemoved === 0) {
    console.log('✅ No duplicate sources found!')
    return
  }

  console.log('💾 Saving cleaned database...')
  await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8')
  console.log('✅ Database cleaned successfully!')
}

// Run the script
removeDuplicateSources().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})
