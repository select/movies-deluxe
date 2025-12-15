#!/usr/bin/env tsx
/**
 * YouTube Movie Scraper
 *
 * Fetches movies from YouTube channels and stores them in data/movies.json
 * Supports multiple channels, OMDB matching, and title parsing
 */

import { parseArgs } from 'node:util'
import { Client } from 'youtubei'
import { generateYouTubeId } from '../types/movie.ts'
import {
  loadMoviesDatabase,
  saveMoviesDatabase,
  upsertMovie,
  getDatabaseStats,
} from './utils/dataManager.ts'
import { matchMovie } from './utils/omdbMatcher.ts'
import { createLogger } from './utils/logger.ts'
import type { YouTubeSource, MovieEntry } from '../types/movie.ts'

const logger = createLogger('YouTubeScraper')

// Default channels to scrape (using channel handles)
const DEFAULT_CHANNELS = [
  '@FilmRiseMovies', // FilmRise Movies
  '@Popcornflix', // Popcornflix
  '@MovieCentral', // Movie Central
]

interface YouTubeVideo {
  id: string
  title: string
  description?: string
  publishedAt?: string
  channelName: string
  channelId: string
  thumbnails?: {
    default?: string
    medium?: string
    high?: string
  }
  duration?: number
  viewCount?: number
}

interface ScraperOptions {
  channels: string[]
  limit: number
  skipOmdb: boolean
  dryRun: boolean
  omdbApiKey?: string
}

/**
 * Parse movie title and year from YouTube video title
 * Common patterns:
 * - "Movie Title (2020)"
 * - "Movie Title | 2020"
 * - "Movie Title - 2020"
 * - "Movie Title [2020]"
 */
function parseMovieTitle(title: string): { title: string; year?: number } {
  // Remove common suffixes
  let cleanTitle = title
    .replace(/\s*\|\s*Full Movie.*$/i, '')
    .replace(/\s*-\s*Full Movie.*$/i, '')
    .replace(/\s*\[Full Movie\].*$/i, '')
    .replace(/\s*\(Full Movie\).*$/i, '')
    .replace(/\s*Full HD.*$/i, '')
    .replace(/\s*4K.*$/i, '')

  // Try to extract year from various patterns
  const yearPatterns = [
    /\((\d{4})\)/, // (2020)
    /\[(\d{4})\]/, // [2020]
    /\|\s*(\d{4})/, // | 2020
    /-\s*(\d{4})/, // - 2020
    /\s+(\d{4})$/, // 2020 at end
  ]

  let year: number | undefined
  for (const pattern of yearPatterns) {
    const match = cleanTitle.match(pattern)
    if (match) {
      const parsedYear = parseInt(match[1])
      // Validate year is reasonable (1900-2030)
      if (parsedYear >= 1900 && parsedYear <= 2030) {
        year = parsedYear
        cleanTitle = cleanTitle.replace(pattern, '').trim()
        break
      }
    }
  }

  // Clean up any remaining artifacts
  cleanTitle = cleanTitle
    .replace(/\s+/g, ' ')
    .replace(/[|-]\s*$/, '')
    .trim()

  return { title: cleanTitle, year }
}

/**
 * Fetch videos from a YouTube channel
 */
async function fetchChannelVideos(
  youtube: Client,
  channelIdentifier: string,
  limit: number
): Promise<YouTubeVideo[]> {
  logger.info(`Fetching videos from channel ${channelIdentifier}...`)

  try {
    // Search for the channel by name or handle
    const searchQuery = channelIdentifier.startsWith('@')
      ? channelIdentifier.slice(1)
      : channelIdentifier

    logger.debug(`Searching for channel: ${searchQuery}`)
    const searchResults = await youtube.search(searchQuery, {
      type: 'channel',
    })

    if (!searchResults.items || searchResults.items.length === 0) {
      throw new Error(`Channel not found: ${channelIdentifier}`)
    }

    const channel = searchResults.items[0]
    logger.debug(`Found channel: ${channel.name} (${channel.id})`)

    // Fetch videos from the channel
    const videoList = await channel.videos.next()

    if (!videoList || videoList.length === 0) {
      logger.warn(`No videos found for channel: ${channel.name}`)
      return []
    }

    const results: YouTubeVideo[] = []
    let count = 0

    for (const video of videoList) {
      if (count >= limit) break

      // Skip shorts, trailers, and clips
      const title = video.title || ''
      if (
        title.toLowerCase().includes('#shorts') ||
        title.toLowerCase().includes('trailer') ||
        title.toLowerCase().includes('clip') ||
        title.toLowerCase().includes('preview') ||
        video.isShort
      ) {
        continue
      }

      // Skip videos shorter than 40 minutes (likely not full movies)
      const duration = video.duration || 0
      if (duration < 40 * 60) {
        continue
      }

      results.push({
        id: video.id,
        title,
        description: video.description || '',
        publishedAt: video.uploadDate || '',
        channelName: channel.name,
        channelId: channel.id,
        thumbnails: {
          default: video.thumbnails?.[0]?.url,
          medium: video.thumbnails?.[1]?.url,
          high: video.thumbnails?.[2]?.url,
        },
        duration,
        viewCount: video.viewCount || 0,
      })

      count++
    }

    logger.success(`Found ${results.length} videos from ${channel.name}`)
    return results
  } catch (error) {
    logger.error(
      `Failed to fetch channel ${channelIdentifier}: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
}

/**
 * Process a single YouTube video
 */
async function processVideo(
  video: YouTubeVideo,
  options: ScraperOptions
): Promise<MovieEntry | null> {
  // Parse title and year
  const { title, year } = parseMovieTitle(video.title)

  // Create YouTube source
  const source: YouTubeSource = {
    type: 'youtube',
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    channelName: video.channelName,
    channelId: video.channelId,
    publishedAt: video.publishedAt,
    duration: video.duration,
    viewCount: video.viewCount,
    thumbnail: video.thumbnails?.high || video.thumbnails?.medium,
    addedAt: new Date().toISOString(),
  }

  // Try OMDB matching if not skipped
  let imdbId = generateYouTubeId(video.id)
  let metadata = undefined

  if (!options.skipOmdb && options.omdbApiKey) {
    logger.debug(`Attempting OMDB match for "${title}"...`)
    const matchResult = await matchMovie(title, year, options.omdbApiKey)

    if (matchResult.confidence !== 'none' && matchResult.imdbId) {
      imdbId = matchResult.imdbId
      metadata = matchResult.metadata
      logger.success(`Matched "${title}" to ${imdbId} (${matchResult.confidence} confidence)`)
    } else {
      logger.warn(`No OMDB match for "${title}", using temporary ID: ${imdbId}`)
    }
  }

  // Create movie entry
  const entry: MovieEntry = {
    imdbId,
    title,
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
async function scrapeYouTube(options: ScraperOptions): Promise<void> {
  logger.info('Starting YouTube scraper...')
  logger.info(`Channels: ${options.channels.join(', ')}`)
  logger.info(`Videos per channel: ${options.limit}`)
  logger.info(`OMDB matching: ${options.skipOmdb ? 'DISABLED' : 'ENABLED'}`)
  logger.info(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`)

  // Load existing database
  const db = await loadMoviesDatabase()
  const initialStats = getDatabaseStats(db)
  logger.info(
    `Initial database: ${initialStats.total} movies (${initialStats.matched} matched, ${initialStats.unmatched} unmatched)`
  )

  // Initialize YouTube client
  logger.info('Initializing YouTube client...')
  const youtube = new Client()
  logger.success('YouTube client ready')

  let totalProcessed = 0
  let totalAdded = 0
  let totalUpdated = 0

  // Process each channel
  for (const channelId of options.channels) {
    logger.info(`\n=== Processing channel: ${channelId} ===`)

    const videos = await fetchChannelVideos(youtube, channelId, options.limit)

    if (videos.length === 0) {
      logger.warn(`No videos found in channel ${channelId}`)
      continue
    }

    // Process each video
    for (const video of videos) {
      try {
        const entry = await processVideo(video, options)
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
        logger.error(`Failed to process "${video.title}":`, error)
      }

      // Rate limiting: 500ms between videos
      await new Promise(resolve => setTimeout(resolve, 500))
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
    logger.info(`YouTube sources: ${finalStats.youtubeSources}`)
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
    channels: {
      type: 'string',
      short: 'c',
      default: DEFAULT_CHANNELS.join(','),
    },
    limit: {
      type: 'string',
      short: 'l',
      default: '50',
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
YouTube Movie Scraper

Usage: pnpm scrape:youtube [options]

Options:
  -c, --channels <list>       Comma-separated list of channel IDs or handles (default: FilmRise,Popcornflix,MovieCentral)
  -l, --limit <number>        Number of videos per channel (default: 50)
  --skip-omdb                 Skip OMDB matching (use temporary IDs)
  --dry-run                   Preview changes without saving
  --omdb-api-key <key>        OMDB API key (or set NUXT_PUBLIC_OMDB_API_KEY env var)
  -h, --help                  Show this help message

Examples:
  pnpm scrape:youtube
  pnpm scrape:youtube --channels UCoz8s7cNPZJ7A7zb9DKN2Ew,UCmEkcDcXqCbJoEX-NRh9-Gg --limit 100
  pnpm scrape:youtube --skip-omdb --dry-run
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
  channels: (values.channels as string).split(',').map(c => c.trim()),
  limit: parseInt(values.limit as string),
  skipOmdb: values['skip-omdb'] || !omdbApiKey,
  dryRun: values['dry-run'] || false,
  omdbApiKey,
}

scrapeYouTube(options).catch(error => {
  logger.error('Scraper failed:', error)
  process.exit(1)
})
