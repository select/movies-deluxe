#!/usr/bin/env tsx

/**
 * AI-Powered Movie Title Extraction Script (OpenCode SDK)
 *
 * Uses OpenCode SDK with Claude 3.5 Sonnet to extract clean movie titles
 * from promotional YouTube/Archive.org titles.
 *
 * Usage:
 *   pnpm extract-titles                    # Process all movies needing extraction
 *   pnpm extract-titles --dry-run          # Preview without saving
 *   pnpm extract-titles --limit 10         # Process only 10 movies
 *   pnpm extract-titles --stats            # Show statistics only
 *   pnpm extract-titles --verbose          # Show detailed output
 *   pnpm extract-titles --min-confidence high|medium|low  # Filter by confidence (default: high)
 *   pnpm extract-titles --filter archive|youtube|all      # Filter by source type
 *
 * Requirements:
 *   - OpenCode server running on localhost:4096
 *   - @opencode-ai/sdk package installed
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createOpencode } from '@opencode-ai/sdk'
import type { MovieEntry, MoviesDatabase } from '../types/movie'
import { createLogger } from './utils/logger'
import { loadPrompt, batchExtractTitles } from './utils/aiTitleExtractor'

const logger = createLogger('extract-titles-ai')

const DATA_FILE = resolve(process.cwd(), 'public/data/movies.json')

// Parse command line arguments
interface CliOptions {
  dryRun: boolean
  limit?: number
  stats: boolean
  verbose: boolean
  minConfidence: 'high' | 'medium' | 'low'
  filter: 'archive' | 'youtube' | 'all'
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2)

  const limitIndex = args.indexOf('--limit')
  const minConfidenceIndex = args.indexOf('--min-confidence')
  const filterIndex = args.indexOf('--filter')

  return {
    dryRun: args.includes('--dry-run'),
    limit: limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : undefined,
    stats: args.includes('--stats'),
    verbose: args.includes('--verbose'),
    minConfidence:
      minConfidenceIndex !== -1
        ? (args[minConfidenceIndex + 1] as 'high' | 'medium' | 'low')
        : 'high',
    filter: filterIndex !== -1 ? (args[filterIndex + 1] as 'archive' | 'youtube' | 'all') : 'all',
  }
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
 * Filter movies needing extraction
 */
function filterMoviesNeedingExtraction(database: MoviesDatabase): MovieEntry[] {
  return Object.entries(database)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, movie]) => movie as MovieEntry)
    .filter(movie => {
      const hasTempId = movie.imdbId.startsWith('archive-') || movie.imdbId.startsWith('youtube-')
      const needsAI = !movie.ai?.extractedTitle
      return hasTempId && needsAI
    })
}

/**
 * Apply filters and limits
 */
function applyFilters(movies: MovieEntry[], options: CliOptions): MovieEntry[] {
  let filtered = movies

  // Apply source filter
  if (options.filter !== 'all') {
    filtered = filtered.filter(movie => movie.imdbId.startsWith(`${options.filter}-`))
  }

  // Apply limit
  if (options.limit) {
    filtered = filtered.slice(0, options.limit)
  }

  return filtered
}

/**
 * Show statistics
 */
function showStatistics(
  database: MoviesDatabase,
  needExtraction: MovieEntry[],
  options: CliOptions
): void {
  const allMovies = Object.entries(database)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, movie]) => movie as MovieEntry)

  const withTempIds = allMovies.filter(
    m => m.imdbId.startsWith('archive-') || m.imdbId.startsWith('youtube-')
  )
  const withAI = allMovies.filter(m => m.ai?.extractedTitle)
  const highConfidence = allMovies.filter(m => m.ai?.confidence === 'high')
  const mediumConfidence = allMovies.filter(m => m.ai?.confidence === 'medium')
  const lowConfidence = allMovies.filter(m => m.ai?.confidence === 'low')

  logger.info('\n=== Database Statistics ===')
  logger.info(`Total movies: ${allMovies.length}`)
  logger.info(`Movies with temp IDs: ${withTempIds.length}`)
  logger.info(`Movies with AI extraction: ${withAI.length}`)
  logger.info(`  - High confidence: ${highConfidence.length}`)
  logger.info(`  - Medium confidence: ${mediumConfidence.length}`)
  logger.info(`  - Low confidence: ${lowConfidence.length}`)
  logger.info(`Movies needing extraction: ${needExtraction.length}`)

  if (options.filter !== 'all') {
    const filtered = needExtraction.filter(m => m.imdbId.startsWith(`${options.filter}-`))
    logger.info(`  - Filtered (${options.filter}): ${filtered.length}`)
  }
}

/**
 * Show summary of extraction results
 */
function showSummary(
  results: Array<{
    id: string
    originalTitle: string
    extractedTitle: string
    confidence: 'high' | 'medium' | 'low'
    error?: string
  }>,
  updatedCount: number,
  options: CliOptions
): void {
  const successful = results.filter(r => !r.error)
  const failed = results.filter(r => r.error)
  const highConf = successful.filter(r => r.confidence === 'high')
  const mediumConf = successful.filter(r => r.confidence === 'medium')
  const lowConf = successful.filter(r => r.confidence === 'low')

  logger.info('\n=== Extraction Summary ===')
  logger.info(`Total processed: ${results.length}`)
  logger.info(`Successful: ${successful.length}`)
  logger.info(`  - High confidence: ${highConf.length}`)
  logger.info(`  - Medium confidence: ${mediumConf.length}`)
  logger.info(`  - Low confidence: ${lowConf.length}`)
  logger.info(`Failed: ${failed.length}`)
  logger.info(`Accepted (min-confidence: ${options.minConfidence}): ${updatedCount}`)
  logger.info(`Rejected: ${successful.length - updatedCount}`)

  if (options.dryRun) {
    logger.info('\nDRY RUN - No changes were saved')
  }

  // Show sample results
  if (options.verbose && successful.length > 0) {
    logger.info('\n=== Sample Results ===')
    successful.slice(0, 10).forEach(result => {
      const status = result.confidence === options.minConfidence ? '✓' : '✗'
      logger.info(`${status} [${result.confidence}] ${result.id}:`)
      logger.info(`  Original:  "${result.originalTitle}"`)
      logger.info(`  Extracted: "${result.extractedTitle}"`)
    })

    if (successful.length > 10) {
      logger.info(`\n... and ${successful.length - 10} more`)
    }
  }

  // Show errors
  if (failed.length > 0) {
    logger.info('\n=== Errors ===')
    failed.forEach(result => {
      logger.error(`${result.id}: ${result.error}`)
    })
  }
}

/**
 * Main execution
 */
async function main() {
  const options = parseCliArgs()

  logger.info('Starting AI-powered title extraction (OpenCode SDK)...')

  // Load movies database
  const database = loadMoviesDatabase()

  // Filter movies needing extraction
  const needExtraction = filterMoviesNeedingExtraction(database)

  // Show stats if requested
  if (options.stats) {
    showStatistics(database, needExtraction, options)
    return
  }

  if (needExtraction.length === 0) {
    logger.info('All movies already have AI-extracted titles.')
    return
  }

  // Apply filters and limits
  const toProcess = applyFilters(needExtraction, options)

  logger.info(
    `Processing ${toProcess.length} movies` +
      (options.limit ? ` (limited to ${options.limit})` : '') +
      (options.filter !== 'all' ? ` (filter: ${options.filter})` : '') +
      (options.dryRun ? ' (DRY RUN)' : '')
  )

  // Start OpenCode server
  logger.info('Starting OpenCode server...')
  const opencode = await createOpencode({
    hostname: '127.0.0.1',
    port: 4096,
    config: {
      model: 'anthropic/claude-3-5-sonnet-20241022',
    },
  })
  logger.success(`OpenCode server running at ${opencode.server.url}`)

  // Create client to interact with server
  const client = opencode.client

  // Create session
  const session = await client.session.create({
    body: { title: 'Movie Title Extraction' },
  })
  const sessionId = session.data.id
  logger.success(`Created OpenCode session: ${sessionId}`)

  try {
    // Load prompt template
    const promptTemplate = await loadPrompt()
    logger.info('Loaded prompt template')

    // Batch extract titles
    const results = await batchExtractTitles(
      client,
      sessionId,
      promptTemplate,
      toProcess.map(m => ({ id: m.imdbId, title: m.title })),
      {
        delayMs: 100,
        onProgress: options.verbose
          ? (current, total, title) => {
              logger.info(`[${current}/${total}] Processing: ${title}`)
            }
          : undefined,
      }
    )

    // Update movies with AI metadata (filter by confidence)
    let updatedCount = 0
    for (const result of results) {
      if (result.error) continue

      // Only accept results meeting minimum confidence threshold
      const confidenceLevels = { low: 0, medium: 1, high: 2 }
      if (confidenceLevels[result.confidence] < confidenceLevels[options.minConfidence]) {
        continue
      }

      const movie = database[result.id] as MovieEntry
      if (!movie) continue

      movie.ai = {
        extractedTitle: result.extractedTitle,
        confidence: result.confidence,
        model: result.model,
        providerID: result.providerID,
        extractedAt: new Date().toISOString(),
        originalTitle: result.originalTitle,
      }
      movie.lastUpdated = new Date().toISOString()
      updatedCount++
    }

    // Show summary
    showSummary(results, updatedCount, options)

    // Save database (unless dry-run)
    if (!options.dryRun && updatedCount > 0) {
      saveMoviesDatabase(database)
    }
  } finally {
    // Close OpenCode server
    opencode.server.close()
    logger.info('Extraction complete')
  }
}

// Run the script
main().catch(error => {
  logger.error(`Script failed: ${error}`)
  process.exit(1)
})
