#!/usr/bin/env node
/**
 * YouTube Blocked Video Detection Script
 *
 * This script checks YouTube videos in our database for availability issues:
 * - Video unavailable
 * - Geographic restrictions (blocked in certain countries)
 * - Private videos
 * - Deleted videos
 *
 * Videos with these issues are marked with the BLOCKED quality label.
 * Region restriction data (allowed/blocked countries) is saved to each YouTube source.
 *
 * Run with: pnpm youtube:detect-blocked
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { google, type youtube_v3 } from 'googleapis'
import { QualityLabel, type MovieEntry } from '../shared/types/movie'
import { createLogger } from '../server/utils/logger'

// Load environment variables
config()

const logger = createLogger('BlockedYouTubeDetector')

// File paths
const MOVIES_FILE = join(process.cwd(), 'data/movies.json')

interface YouTubeRegionRestriction {
  allowed?: string[]
  blocked?: string[]
}

interface YouTubeVideoStatus {
  videoId: string
  isBlocked: boolean
  reason?: string
  privacyStatus?: string
  uploadStatus?: string
  embeddable?: boolean
  regionRestriction?: YouTubeRegionRestriction
}

class BlockedYouTubeDetector {
  private youtube: youtube_v3.Youtube
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    })
  }

  /**
   * Check video status using YouTube Data API v3
   */
  async checkVideoStatus(videoId: string): Promise<YouTubeVideoStatus> {
    try {
      const response = await this.youtube.videos.list({
        part: ['status', 'snippet', 'contentDetails'],
        id: [videoId],
      })

      const video = response.data.items?.[0]

      if (!video) {
        // Video not found - likely deleted or private
        return {
          videoId,
          isBlocked: true,
          reason: 'Video not found (deleted or private)',
        }
      }

      const status = video.status
      const contentDetails = video.contentDetails

      // Check various blocking conditions
      let isBlocked = false
      let reason = ''

      // Check privacy status
      if (status?.privacyStatus === 'private') {
        isBlocked = true
        reason = 'Private video'
      } else if (status?.privacyStatus === 'unlisted') {
        // Unlisted videos are still accessible via direct link, so not blocked
        isBlocked = false
      }

      // Check upload status
      if (status?.uploadStatus === 'deleted') {
        isBlocked = true
        reason = 'Video deleted'
      } else if (status?.uploadStatus === 'failed') {
        isBlocked = true
        reason = 'Upload failed'
      } else if (status?.uploadStatus === 'rejected') {
        isBlocked = true
        reason = 'Video rejected by YouTube'
      }

      // Check if embeddable (important for our iframe player)
      if (status?.embeddable === false) {
        isBlocked = true
        reason = 'Video not embeddable'
      }

      // Check for geographic restrictions
      if (status?.madeForKids === true && !status?.selfDeclaredMadeForKids) {
        // YouTube automatically marked as made for kids - may have restrictions
        reason = reason ? `${reason}, Made for kids restrictions` : 'Made for kids restrictions'
      }

      // Extract region restriction data
      const regionRestriction = contentDetails?.regionRestriction
        ? {
            allowed: contentDetails.regionRestriction.allowed,
            blocked: contentDetails.regionRestriction.blocked,
          }
        : undefined

      return {
        videoId,
        isBlocked,
        reason: reason || undefined,
        privacyStatus: status?.privacyStatus,
        uploadStatus: status?.uploadStatus,
        embeddable: status?.embeddable,
        regionRestriction,
      }
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      logger.error(`Error checking video ${videoId}:`, err.message || 'Unknown error')

      // If we get a 403 or 404, the video is likely blocked/deleted
      if (err.code === 403 || err.code === 404) {
        return {
          videoId,
          isBlocked: true,
          reason: `API error ${err.code}: Video inaccessible`,
        }
      }

      // For other errors, don't mark as blocked (might be temporary API issue)
      return {
        videoId,
        isBlocked: false,
        reason: `API error: ${error.message}`,
      }
    }
  }

  /**
   * Check multiple videos in batches
   */
  async checkVideosInBatch(videoIds: string[]): Promise<YouTubeVideoStatus[]> {
    const results: YouTubeVideoStatus[] = []
    const batchSize = 50 // YouTube API allows up to 50 video IDs per request

    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize)
      logger.info(
        `Checking batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videoIds.length / batchSize)} (${batch.length} videos)`
      )

      try {
        const response = await this.youtube.videos.list({
          part: ['status', 'snippet', 'contentDetails'],
          id: batch,
        })

        const videos = response.data.items || []
        const foundVideoIds = new Set(videos.map(v => v.id).filter((id): id is string => !!id))

        // Process found videos
        for (const video of videos) {
          const status = video.status
          const contentDetails = video.contentDetails
          let isBlocked = false
          let reason = ''

          // Check blocking conditions
          if (status?.privacyStatus === 'private') {
            isBlocked = true
            reason = 'Private video'
          } else if (status?.uploadStatus === 'deleted') {
            isBlocked = true
            reason = 'Video deleted'
          } else if (status?.uploadStatus === 'failed') {
            isBlocked = true
            reason = 'Upload failed'
          } else if (status?.uploadStatus === 'rejected') {
            isBlocked = true
            reason = 'Video rejected'
          } else if (status?.embeddable === false) {
            isBlocked = true
            reason = 'Not embeddable'
          }

          // Extract region restriction data
          const regionRestriction = contentDetails?.regionRestriction
            ? {
                allowed: contentDetails.regionRestriction.allowed,
                blocked: contentDetails.regionRestriction.blocked,
              }
            : undefined

          results.push({
            videoId: video.id,
            isBlocked,
            reason: reason || undefined,
            privacyStatus: status?.privacyStatus,
            uploadStatus: status?.uploadStatus,
            embeddable: status?.embeddable,
            regionRestriction,
          })
        }

        // Handle videos not found in response (deleted/private)
        for (const videoId of batch) {
          if (!foundVideoIds.has(videoId)) {
            results.push({
              videoId,
              isBlocked: true,
              reason: 'Video not found (deleted or private)',
            })
          }
        }

        // Rate limiting - wait between batches
        if (i + batchSize < videoIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error: unknown) {
        const err = error as { message?: string }
        logger.error(`Error checking batch:`, err.message || 'Unknown error')

        // Mark all videos in failed batch as unknown status
        for (const videoId of batch) {
          results.push({
            videoId,
            isBlocked: false,
            reason: `Batch API error: ${error.message}`,
          })
        }
      }
    }

    return results
  }

  /**
   * Process all YouTube videos in the database
   */
  async processAllVideos(): Promise<void> {
    logger.info('Loading movies database...')

    const moviesData = JSON.parse(readFileSync(MOVIES_FILE, 'utf-8'))
    const movies = Object.values(moviesData) as MovieEntry[]

    // Extract all YouTube video IDs
    const youtubeVideoIds: string[] = []
    const videoToMovieMap = new Map<string, string[]>() // videoId -> [movieIds]

    for (const movie of movies) {
      if (typeof movie === 'object' && movie.sources) {
        for (const source of movie.sources) {
          if (source.type === 'youtube' && source.id) {
            youtubeVideoIds.push(source.id)

            if (!videoToMovieMap.has(source.id)) {
              videoToMovieMap.set(source.id, [])
            }
            videoToMovieMap.get(source.id)!.push(movie.movieId)
          }
        }
      }
    }

    const uniqueVideoIds = [...new Set(youtubeVideoIds)]
    logger.info(`Found ${uniqueVideoIds.length} unique YouTube videos to check`)

    if (uniqueVideoIds.length === 0) {
      logger.info('No YouTube videos found in database')
      return
    }

    // Check video statuses
    logger.info('Checking video statuses...')
    const videoStatuses = await this.checkVideosInBatch(uniqueVideoIds)

    // Process results
    const blockedVideos = videoStatuses.filter(v => v.isBlocked)
    const availableVideos = videoStatuses.filter(v => !v.isBlocked)

    logger.info(`Results: ${blockedVideos.length} blocked, ${availableVideos.length} available`)

    if (blockedVideos.length > 0) {
      logger.info('Blocked videos:')
      for (const video of blockedVideos) {
        const movieIds = videoToMovieMap.get(video.videoId) || []
        logger.info(`  ${video.videoId}: ${video.reason} (affects ${movieIds.length} movies)`)
      }
    }

    // Update movies with BLOCKED quality label and region restrictions
    let updatedMovies = 0
    let updatedRegionRestrictions = 0
    const blockedVideoIds = new Set(blockedVideos.map(v => v.videoId))
    const videoStatusMap = new Map<string, YouTubeVideoStatus>()
    for (const status of videoStatuses) {
      videoStatusMap.set(status.videoId, status)
    }

    for (const movie of movies) {
      if (typeof movie === 'object' && movie.sources) {
        let hasBlockedSource = false
        let hasUpdatedRegionRestriction = false

        for (const source of movie.sources) {
          if (source.type === 'youtube' && source.id) {
            // Check if video is blocked
            if (blockedVideoIds.has(source.id)) {
              hasBlockedSource = true
            }

            // Update region restriction data
            const videoStatus = videoStatusMap.get(source.id)
            if (videoStatus?.regionRestriction) {
              const existingRestriction = source.regionRestriction
              const newRestriction = videoStatus.regionRestriction

              // Only update if data has changed
              const hasChanged =
                JSON.stringify(existingRestriction) !== JSON.stringify(newRestriction)

              if (hasChanged) {
                source.regionRestriction = newRestriction
                hasUpdatedRegionRestriction = true
              }
            } else if (source.regionRestriction) {
              // Remove region restriction if it no longer exists
              delete source.regionRestriction
              hasUpdatedRegionRestriction = true
            }
          }
        }

        if (hasBlockedSource) {
          // Add BLOCKED quality label if not already present
          if (!movie.qualityLabels) {
            movie.qualityLabels = []
          }

          if (!movie.qualityLabels.includes(QualityLabel.BLOCKED)) {
            movie.qualityLabels.push(QualityLabel.BLOCKED)
            movie.qualityMarkedAt = new Date().toISOString()
            movie.qualityMarkedBy = 'system'
            movie.qualityNotes = movie.qualityNotes
              ? `${movie.qualityNotes}; YouTube video blocked/unavailable`
              : 'YouTube video blocked/unavailable'

            updatedMovies++
            logger.info(`Marked movie ${movie.movieId} (${movie.title}) as BLOCKED`)
          }
        }

        if (hasUpdatedRegionRestriction) {
          updatedRegionRestrictions++
        }
      }
    }

    if (updatedMovies > 0 || updatedRegionRestrictions > 0) {
      // Save updated database
      logger.info(
        `Updating database: ${updatedMovies} movies marked as BLOCKED, ${updatedRegionRestrictions} region restrictions updated...`
      )

      // Convert back to object format
      const updatedData: Record<string, MovieEntry> = {}
      for (const movie of movies) {
        if (typeof movie === 'object' && movie.movieId) {
          updatedData[movie.movieId] = movie
        }
      }

      // Preserve schema and other metadata
      const originalData = JSON.parse(readFileSync(MOVIES_FILE, 'utf-8'))
      if (originalData._schema) {
        updatedData._schema = originalData._schema
      }

      writeFileSync(MOVIES_FILE, JSON.stringify(updatedData, null, 2))
      logger.success(
        `Updated movies database: ${updatedMovies} BLOCKED movies, ${updatedRegionRestrictions} region restrictions`
      )
    } else {
      logger.info('No movies needed updating')
    }

    // Summary
    logger.info('\n=== SUMMARY ===')
    logger.info(`Total YouTube videos checked: ${uniqueVideoIds.length}`)
    logger.info(`Blocked videos found: ${blockedVideos.length}`)
    logger.info(`Movies marked as BLOCKED: ${updatedMovies}`)
    logger.info(`Region restrictions updated: ${updatedRegionRestrictions}`)

    if (blockedVideos.length > 0) {
      logger.info('\nBlocked video reasons:')
      const reasonCounts = new Map<string, number>()
      for (const video of blockedVideos) {
        const reason = video.reason || 'Unknown'
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1)
      }

      for (const [reason, count] of Array.from(reasonCounts.entries())) {
        logger.info(`  ${reason}: ${count} videos`)
      }
    }

    // Region restriction statistics
    const videosWithRestrictions = videoStatuses.filter(v => v.regionRestriction)
    if (videosWithRestrictions.length > 0) {
      logger.info(`\nVideos with region restrictions: ${videosWithRestrictions.length}`)

      const allowedCount = videosWithRestrictions.filter(v => v.regionRestriction?.allowed).length
      const blockedCount = videosWithRestrictions.filter(v => v.regionRestriction?.blocked).length

      if (allowedCount > 0) {
        logger.info(`  Videos with allowed regions: ${allowedCount}`)
      }
      if (blockedCount > 0) {
        logger.info(`  Videos with blocked regions: ${blockedCount}`)
      }
    }
  }
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey || apiKey === 'your_youtube_api_key_here') {
    logger.error('YouTube API key not found!')
    logger.error('Please set YOUTUBE_API_KEY in your .env file')
    logger.error('Get an API key from: https://console.cloud.google.com/apis/credentials')
    process.exit(1)
  }

  try {
    const detector = new BlockedYouTubeDetector(apiKey)
    await detector.processAllVideos()
  } catch (error) {
    logger.error('Script failed:', error)
    process.exit(1)
  }
}

// Run the script
main().catch(console.error)
