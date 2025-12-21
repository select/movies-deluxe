#!/usr/bin/env tsx
/**
 * Archive.org Movie Scraper
 *
 * Fetches movies from Archive.org collections and stores them in data/movies.json
 * Supports pagination, multiple collections, and OMDB matching
 */

import { parseArgs } from 'node:util'
import { generateArchiveId } from '../types/movie.ts'
import {
  loadMoviesDatabase,
  saveMoviesDatabase,
  upsertMovie,
  getDatabaseStats,
} from './utils/dataManager.ts'
import { matchMovie } from './utils/omdbMatcher.ts'
import { createLogger } from './utils/logger.ts'
import type { ArchiveOrgSource, MovieEntry } from '../types/movie.ts'

const logger = createLogger('ArchiveScraper')

interface ArchiveOrgMovie {
  title: string
  identifier: string
  description?: string
  date?: string
  year?: string
  creator?: string | string[]
  subject?: string[]
  collection?: string[]
  downloads?: number
  mediatype?: string
}

interface ArchiveOrgResponse {
  response: {
    docs: ArchiveOrgMovie[]
    numFound: number
  }
}

interface ScraperOptions {
  collections: string[]
  rows: number
  pages: number
  skipOmdb: boolean
  dryRun: boolean
  omdbApiKey?: string
}

/**
 * Fetch movies from Archive.org
 */
async function fetchArchiveOrgMovies(
  collection: string,
  rows: number,
  page: number
): Promise<ArchiveOrgMovie[]> {
  const start = page * rows

  const url = new URL('https://archive.org/advancedsearch.php')
  url.searchParams.set('q', `mediatype:movies AND collection:${collection}`)
  url.searchParams.set('output', 'json')
  url.searchParams.set('rows', rows.toString())
  url.searchParams.set('start', start.toString())
  url.searchParams.set('sort', 'downloads desc')

  logger.info(`Fetching ${collection} page ${page + 1} (${start}-${start + rows})...`)

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as ArchiveOrgResponse
    const movies = data.response.docs || []

    logger.success(
      `Fetched ${movies.length} movies from ${collection} (total: ${data.response.numFound})`
    )
    return movies
  } catch (error) {
    logger.error(`Failed to fetch from ${collection}:`, error)
    return []
  }
}

/**
 * Extract year from Archive.org date field
 */
function extractYear(date?: string): number | undefined {
  if (!date) return undefined

  // Try to parse year from various date formats
  const yearMatch = date.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    return parseInt(yearMatch[0])
  }

  return undefined
}

/**
 * Process a single Archive.org movie
 */
async function processMovie(
  movie: ArchiveOrgMovie,
  collection: string,
  options: ScraperOptions
): Promise<MovieEntry | null> {
  const year = extractYear(movie.date || movie.year)

  // Create Archive.org source
  const source: ArchiveOrgSource = {
    type: 'archive.org',
    identifier: movie.identifier,
    url: `https://archive.org/details/${movie.identifier}`,
    collection,
    downloads: movie.downloads,
    thumbnail: `https://archive.org/services/img/${movie.identifier}`,
    releaseDate: movie.date || movie.year, // Store original date/year from Archive.org
    addedAt: new Date().toISOString(),
  }

  // Try OMDB matching if not skipped
  let imdbId = generateArchiveId(movie.identifier)
  let metadata = undefined

  if (!options.skipOmdb && options.omdbApiKey) {
    logger.debug(`Attempting OMDB match for "${movie.title}"...`)
    const matchResult = await matchMovie(movie.title, year, options.omdbApiKey)

    if (matchResult.confidence !== 'none' && matchResult.imdbId) {
      imdbId = matchResult.imdbId
      metadata = matchResult.metadata
      logger.success(`Matched "${movie.title}" to ${imdbId} (${matchResult.confidence} confidence)`)
    } else {
      logger.warn(`No OMDB match for "${movie.title}", using temporary ID: ${imdbId}`)
    }
  }

  // Create movie entry
  const entry: MovieEntry = {
    imdbId,
    title: movie.title,
    year,
    sources: [source],
    metadata,
    lastUpdated: new Date().toISOString(),
  }

  return entry
}

/**
 * Main scraper function
 */
async function scrapeArchiveOrg(options: ScraperOptions): Promise<void> {
  logger.info('Starting Archive.org scraper...')
  logger.info(`Collections: ${options.collections.join(', ')}`)
  logger.info(`Rows per page: ${options.rows}`)
  logger.info(`Pages per collection: ${options.pages}`)
  logger.info(`OMDB matching: ${options.skipOmdb ? 'DISABLED' : 'ENABLED'}`)
  logger.info(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`)

  // Load existing database
  const db = await loadMoviesDatabase()
  const initialStats = getDatabaseStats(db)
  logger.info(
    `Initial database: ${initialStats.total} movies (${initialStats.matched} matched, ${initialStats.unmatched} unmatched)`
  )

  let totalProcessed = 0
  let totalAdded = 0
  let totalUpdated = 0

  // Process each collection
  for (const collection of options.collections) {
    logger.info(`\n=== Processing collection: ${collection} ===`)

    for (let page = 0; page < options.pages; page++) {
      const movies = await fetchArchiveOrgMovies(collection, options.rows, page)

      if (movies.length === 0) {
        logger.warn(`No more movies in ${collection}, stopping pagination`)
        break
      }

      // Process each movie
      for (const movie of movies) {
        try {
          const entry = await processMovie(movie, collection, options)
          if (entry) {
            const existingEntry = db[entry.imdbId]

            if (!options.dryRun) {
              upsertMovie(db, entry.imdbId, entry)

              if (existingEntry) {
                totalUpdated++
              } else {
                totalAdded++
              }
            }

            totalProcessed++
          }
        } catch (error) {
          logger.error(`Failed to process "${movie.title}":`, error)
        }
      }

      // Break if we got fewer results than requested (last page)
      if (movies.length < options.rows) {
        logger.info(`Reached last page of ${collection}`)
        break
      }
    }
  }

  // Save database
  if (!options.dryRun) {
    await saveMoviesDatabase(db)
    const finalStats = getDatabaseStats(db)

    logger.success('\n=== Scraping Complete ===')
    logger.info(`Processed: ${totalProcessed} movies`)
    logger.info(`Added: ${totalAdded} new movies`)
    logger.info(`Updated: ${totalUpdated} existing movies`)
    logger.info(
      `Final database: ${finalStats.total} movies (${finalStats.matched} matched, ${finalStats.unmatched} unmatched)`
    )
    logger.info(`Archive.org sources: ${finalStats.archiveOrgSources}`)
  } else {
    logger.info('\n=== Dry Run Complete ===')
    logger.info(`Would process: ${totalProcessed} movies`)
    logger.info(`Would add: ${totalAdded} new movies`)
    logger.info(`Would update: ${totalUpdated} existing movies`)
  }
}

// Parse command line arguments
const { values } = parseArgs({
  options: {
    collections: {
      type: 'string',
      short: 'c',
      default: 'feature_films',
    },
    rows: {
      type: 'string',
      short: 'r',
      default: '100',
    },
    pages: {
      type: 'string',
      short: 'p',
      default: '5',
    },
    'skip-omdb': {
      type: 'boolean',
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      default: false,
    },
    'omdb-api-key': {
      type: 'string',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
})

if (values.help) {
  console.log(`
Archive.org Movie Scraper

Usage: pnpm scrape:archive [options]

Options:
  -c, --collections <list>    Comma-separated list of collections (default: feature_films)
  -r, --rows <number>         Number of results per page (default: 100)
  -p, --pages <number>        Number of pages to fetch per collection (default: 5)
  --skip-omdb                 Skip OMDB matching (use temporary IDs)
  --dry-run                   Preview changes without saving
  --omdb-api-key <key>        OMDB API key (or set NUXT_PUBLIC_OMDB_API_KEY env var)
  -h, --help                  Show this help message

Examples:
  pnpm scrape:archive
  pnpm scrape:archive --collections feature_films,silent_films --pages 10
  pnpm scrape:archive --skip-omdb --dry-run
  `)
  process.exit(0)
}

// Get OMDB API key from env or command line
const omdbApiKey = values['omdb-api-key'] || process.env.NUXT_PUBLIC_OMDB_API_KEY

if (!values['skip-omdb'] && !omdbApiKey) {
  logger.warn('OMDB API key not found. Set NUXT_PUBLIC_OMDB_API_KEY or use --omdb-api-key')
  logger.warn('Continuing without OMDB matching (use --skip-omdb to suppress this warning)')
}

// Run scraper
const options: ScraperOptions = {
  collections: (values.collections as string).split(',').map(c => c.trim()),
  rows: parseInt(values.rows as string),
  pages: parseInt(values.pages as string),
  skipOmdb: values['skip-omdb'] || !omdbApiKey,
  dryRun: values['dry-run'] || false,
  omdbApiKey,
}

scrapeArchiveOrg(options).catch(error => {
  logger.error('Scraper failed:', error)
  process.exit(1)
})
