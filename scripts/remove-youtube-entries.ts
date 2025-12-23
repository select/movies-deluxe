#!/usr/bin/env tsx
/**
 * Remove YouTube Entries Script
 *
 * Removes all YouTube sources from movies.json. If a movie only has YouTube sources,
 * the entire movie entry is removed. If it has other sources (e.g., Archive.org),
 * only the YouTube sources are removed.
 *
 * Usage:
 *   pnpm tsx scripts/remove-youtube-entries.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Preview changes without saving
 */

import { parseArgs } from 'node:util'
import { loadMoviesDatabase, saveMoviesDatabase } from './utils/dataManager.ts'
import { createLogger } from './utils/logger.ts'
import type { MovieEntry } from '../shared/types/movie.ts'

const logger = createLogger('RemoveYouTube')

interface RemovalStats {
  moviesScanned: number
  moviesWithYouTube: number
  moviesFullyRemoved: number
  moviesPartiallyRemoved: number
  youtubeSourcesRemoved: number
  otherSourcesRetained: number
}

/**
 * Remove YouTube sources from the database
 */
async function removeYouTubeSources(dryRun: boolean): Promise<void> {
  logger.info('Starting YouTube source removal...')
  logger.info(`Dry run: ${dryRun ? 'YES' : 'NO'}`)

  // Load database
  const db = await loadMoviesDatabase()
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))

  const stats: RemovalStats = {
    moviesScanned: entries.length,
    moviesWithYouTube: 0,
    moviesFullyRemoved: 0,
    moviesPartiallyRemoved: 0,
    youtubeSourcesRemoved: 0,
    otherSourcesRetained: 0,
  }

  const moviesToRemove: string[] = []
  const moviesToUpdate: Array<{ id: string; entry: MovieEntry }> = []

  // Process each movie
  for (const [movieId, entry] of entries) {
    const movieEntry = entry as MovieEntry
    const sources = movieEntry.sources || []

    // Count YouTube sources
    const youtubeSourceCount = sources.filter(s => s.type === 'youtube').length
    const otherSourceCount = sources.length - youtubeSourceCount

    if (youtubeSourceCount === 0) {
      // No YouTube sources, skip
      continue
    }

    stats.moviesWithYouTube++
    stats.youtubeSourcesRemoved += youtubeSourceCount
    stats.otherSourcesRetained += otherSourceCount

    if (otherSourceCount === 0) {
      // Only has YouTube sources - remove entire movie
      stats.moviesFullyRemoved++
      moviesToRemove.push(movieId)
      logger.debug(`Will remove movie: ${movieEntry.title} (${movieId}) - only YouTube sources`)
    } else {
      // Has other sources - keep movie but remove YouTube sources
      stats.moviesPartiallyRemoved++
      const updatedEntry: MovieEntry = {
        ...movieEntry,
        sources: sources.filter(s => s.type !== 'youtube'),
        lastUpdated: new Date().toISOString(),
      }
      moviesToUpdate.push({ id: movieId, entry: updatedEntry })
      logger.debug(
        `Will update movie: ${movieEntry.title} (${movieId}) - removing ${youtubeSourceCount} YouTube source(s), keeping ${otherSourceCount} other source(s)`
      )
    }
  }

  // Apply changes
  if (!dryRun) {
    logger.info('Applying changes...')

    // Remove movies with only YouTube sources
    for (const movieId of moviesToRemove) {
      delete db[movieId]
    }

    // Update movies with mixed sources
    for (const { id, entry } of moviesToUpdate) {
      db[id] = entry
    }

    // Save database
    await saveMoviesDatabase(db)
    logger.success('Changes saved to database')
  }

  // Print summary
  logger.info('\n=== Removal Summary ===')
  logger.info(`Movies scanned: ${stats.moviesScanned}`)
  logger.info(`Movies with YouTube sources: ${stats.moviesWithYouTube}`)
  logger.info(`  - Fully removed (only YouTube): ${stats.moviesFullyRemoved}`)
  logger.info(`  - Partially updated (mixed sources): ${stats.moviesPartiallyRemoved}`)
  logger.info(`YouTube sources removed: ${stats.youtubeSourcesRemoved}`)
  logger.info(`Other sources retained: ${stats.otherSourcesRetained}`)

  if (dryRun) {
    logger.warn('\n⚠️  DRY RUN - No changes were saved')
    logger.info('Run without --dry-run to apply changes')
  } else {
    logger.success('\n✅ YouTube sources removed successfully')
  }
}

/**
 * Main entry point
 */
async function main() {
  const { values } = parseArgs({
    options: {
      'dry-run': {
        type: 'boolean',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
  })

  if (values.help) {
    console.log(`
Remove YouTube Entries Script

Usage: pnpm tsx scripts/remove-youtube-entries.ts [options]

Options:
  --dry-run    Preview changes without saving
  -h, --help   Show this help message

Examples:
  pnpm tsx scripts/remove-youtube-entries.ts --dry-run
  pnpm tsx scripts/remove-youtube-entries.ts
    `)
    process.exit(0)
  }

  try {
    await removeYouTubeSources(values['dry-run'] || false)
  } catch (error) {
    logger.error('Failed to remove YouTube sources:', error)
    process.exit(1)
  }
}

main()
