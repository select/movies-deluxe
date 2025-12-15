#!/usr/bin/env tsx
/**
 * Download and cache movie poster images locally
 *
 * This script downloads poster images from OMDB metadata URLs and saves them
 * to /public/posters/[imdbId].jpg for faster loading and offline support.
 *
 * Usage:
 *   pnpm download-posters                    # Download all missing posters
 *   pnpm download-posters --force            # Re-download all posters
 *   pnpm download-posters --limit 10         # Download only 10 posters
 *   pnpm download-posters --dry-run          # Show what would be downloaded
 *   pnpm download-posters --concurrency 3    # Parallel downloads (default: 5)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { batchDownloadImages } from './utils/imageDownloader'
import { createLogger } from './utils/logger'
import type { MoviesDatabase, MovieEntry } from '../types/movie'

const logger = createLogger('PosterDownloader')

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const DATA_FILE = path.join(__dirname, '../data/movies.json')
const POSTERS_DIR = path.join(__dirname, '../public/posters')

interface DownloadOptions {
  force?: boolean
  limit?: number
  dryRun?: boolean
  concurrency?: number
}

interface PosterDownload {
  imdbId: string
  title: string
  posterUrl: string
  outputPath: string
}

interface DownloadReport {
  total: number
  withPosters: number
  toDownload: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{ imdbId: string; title: string; error: string }>
  duration: number
}

/**
 * Load movies from data/movies.json
 */
function loadMoviesData(): MoviesDatabase {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    logger.error(`Failed to load ${DATA_FILE}:`, error)
    throw error
  }
}

/**
 * Get poster file path for an imdbId
 */
function getPosterPath(imdbId: string): string {
  return path.join(POSTERS_DIR, `${imdbId}.jpg`)
}

/**
 * Extract poster download list from movies database
 */
function extractPosterDownloads(
  database: MoviesDatabase,
  options: DownloadOptions
): PosterDownload[] {
  const downloads: PosterDownload[] = []

  // Iterate through all movies (skip _schema and _example)
  for (const [key, value] of Object.entries(database)) {
    if (key.startsWith('_') || !value || typeof value !== 'object') {
      continue
    }

    const movie = value as MovieEntry

    // Check if movie has OMDB metadata with poster URL
    const posterUrl = movie.metadata?.poster
    if (!posterUrl || posterUrl === 'N/A') {
      continue
    }

    const outputPath = getPosterPath(movie.imdbId)

    // Skip if already exists (unless force flag is set)
    if (!options.force && fs.existsSync(outputPath)) {
      continue
    }

    downloads.push({
      imdbId: movie.imdbId,
      title: movie.title,
      posterUrl,
      outputPath,
    })

    // Respect limit if set
    if (options.limit && downloads.length >= options.limit) {
      break
    }
  }

  return downloads
}

/**
 * Display download preview
 */
function showDownloadPreview(
  downloads: PosterDownload[],
  totalMovies: number,
  moviesWithPosters: number
) {
  logger.info('='.repeat(80))
  logger.info('Poster Download Preview')
  logger.info('='.repeat(80))
  logger.info(`Total movies in database: ${totalMovies}`)
  logger.info(`Movies with poster URLs: ${moviesWithPosters}`)
  logger.info(`Posters to download: ${downloads.length}`)
  logger.info('')

  if (downloads.length > 0) {
    logger.info('First 5 downloads:')
    downloads.slice(0, 5).forEach((download, index) => {
      logger.info(`  ${index + 1}. ${download.title} (${download.imdbId})`)
      logger.info(`     URL: ${download.posterUrl}`)
      logger.info(`     Output: ${path.basename(download.outputPath)}`)
    })

    if (downloads.length > 5) {
      logger.info(`  ... and ${downloads.length - 5} more`)
    }
  }

  logger.info('='.repeat(80))
}

/**
 * Display download report
 */
function showDownloadReport(report: DownloadReport) {
  logger.info('')
  logger.info('='.repeat(80))
  logger.info('Download Report')
  logger.info('='.repeat(80))
  logger.info(`Total movies: ${report.total}`)
  logger.info(`Movies with poster URLs: ${report.withPosters}`)
  logger.info(`Posters to download: ${report.toDownload}`)
  logger.info(`Successfully downloaded: ${report.successful}`)
  logger.info(`Failed: ${report.failed}`)
  logger.info(`Skipped (already exists): ${report.skipped}`)
  logger.info(`Duration: ${(report.duration / 1000).toFixed(2)}s`)
  logger.info('='.repeat(80))

  if (report.errors.length > 0) {
    logger.error('')
    logger.error('Failed downloads:')
    report.errors.forEach((error, index) => {
      logger.error(`  ${index + 1}. ${error.title} (${error.imdbId})`)
      logger.error(`     Error: ${error.error}`)
    })
  }

  if (report.successful > 0) {
    logger.success('')
    logger.success(
      `✓ Successfully downloaded ${report.successful} poster${report.successful === 1 ? '' : 's'}`
    )
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): DownloadOptions {
  const args = process.argv.slice(2)
  const options: DownloadOptions = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--force') {
      options.force = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--limit') {
      options.limit = parseInt(args[++i], 10)
    } else if (arg === '--concurrency') {
      options.concurrency = parseInt(args[++i], 10)
    } else if (arg === '--help' || arg === '-h') {
      // eslint-disable-next-line no-console
      console.log(`
Usage: pnpm download-posters [options]

Options:
  --force            Re-download all posters (even if they exist)
  --limit N          Download only N posters
  --dry-run          Show what would be downloaded without downloading
  --concurrency N    Number of parallel downloads (default: 5)
  --help, -h         Show this help message

Examples:
  pnpm download-posters                    # Download all missing posters
  pnpm download-posters --force            # Re-download all posters
  pnpm download-posters --limit 10         # Download only 10 posters
  pnpm download-posters --dry-run          # Preview downloads
  pnpm download-posters --concurrency 3    # Limit to 3 parallel downloads
      `)
      process.exit(0)
    }
  }

  return options
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now()
  const options = parseArgs()

  logger.info('Starting poster download process...')
  logger.info(`Options: ${JSON.stringify(options)}`)
  logger.info('')

  // Ensure posters directory exists
  if (!fs.existsSync(POSTERS_DIR)) {
    logger.info(`Creating posters directory: ${POSTERS_DIR}`)
    fs.mkdirSync(POSTERS_DIR, { recursive: true })
  }

  // Load movies data
  logger.info('Loading movies database...')
  const database = loadMoviesData()

  // Count movies and movies with posters
  const allMovies = Object.entries(database).filter(([key]) => !key.startsWith('_'))
  const totalMovies = allMovies.length
  const moviesWithPosters = allMovies.filter(([_, movie]) => {
    const m = movie as MovieEntry
    return m.metadata?.poster && m.metadata.poster !== 'N/A'
  }).length

  logger.info(`Loaded ${totalMovies} movies (${moviesWithPosters} with poster URLs)`)

  // Extract poster downloads
  const downloads = extractPosterDownloads(database, options)

  if (downloads.length === 0) {
    logger.info('No posters to download!')
    logger.info('')
    if (moviesWithPosters === 0) {
      logger.warn('Tip: Run OMDB enrichment first to get poster URLs')
      logger.warn('     pnpm enrich:omdb')
    } else {
      logger.success('All posters are already downloaded!')
    }
    return
  }

  // Show preview
  showDownloadPreview(downloads, totalMovies, moviesWithPosters)

  // Dry run mode - exit early
  if (options.dryRun) {
    logger.info('')
    logger.info('Dry run mode - no downloads performed')
    return
  }

  // Confirm before proceeding
  logger.info('')
  logger.info('Starting downloads...')
  logger.info('')

  // Perform batch download
  let completed = 0
  const result = await batchDownloadImages(
    downloads.map(d => ({ url: d.posterUrl, filepath: d.outputPath })),
    {
      concurrency: options.concurrency || 5,
      timeout: 30000,
      maxRetries: 3,
      validateAfter: true,
      onProgress: (current, total, url) => {
        completed++
        const progress = ((completed / total) * 100).toFixed(1)
        const imdbId = downloads.find(d => d.posterUrl === url)?.imdbId || 'unknown'
        logger.info(`[${progress}%] Downloaded ${completed}/${total}: ${imdbId}`)
      },
    }
  )

  // Collect errors
  const errors: Array<{ imdbId: string; title: string; error: string }> = []
  downloads.forEach(download => {
    const downloadResult = result.results.get(download.outputPath)
    if (downloadResult && !downloadResult.success) {
      errors.push({
        imdbId: download.imdbId,
        title: download.title,
        error: downloadResult.error || 'Unknown error',
      })
    }
  })

  // Create report
  const report: DownloadReport = {
    total: totalMovies,
    withPosters: moviesWithPosters,
    toDownload: downloads.length,
    successful: result.successful,
    failed: result.failed,
    skipped: result.skipped,
    errors,
    duration: Date.now() - startTime,
  }

  // Display report
  showDownloadReport(report)

  // Exit with error code if there were failures
  if (result.failed > 0) {
    process.exit(1)
  }
}

// Run main function
main().catch(error => {
  logger.error('Fatal error:', error)
  process.exit(1)
})
