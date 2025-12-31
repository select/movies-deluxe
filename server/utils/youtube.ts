import type { Innertube } from 'youtubei.js'
import {
  generateYouTubeId,
  type MoviesDatabase,
  type YouTubeSource,
  type MovieEntry,
} from '../../shared/types/movie'
import {
  saveFailedYouTubeVideo,
  removeFailedYouTubeVideo,
  type FailureReason,
} from './failedYoutube'

export function parseMovieTitle(title: string): { title: string; year?: number } {
  const yearPatterns = [/\((\d{4})\)/, /\[(\d{4})\]/, /\|\s*(\d{4})/, /-\s*(\d{4})/, /\s+(\d{4})$/]

  let year: number | undefined
  for (const pattern of yearPatterns) {
    const match = title.match(pattern)
    if (match && match[1]) {
      const parsedYear = parseInt(match[1])
      if (parsedYear >= 1900 && parsedYear <= 2030) {
        year = parsedYear
        break
      }
    }
  }

  return { title, year }
}

export async function fetchChannelVideos(
  youtube: Innertube,
  channelIdentifier: string,
  db: MoviesDatabase,
  channelConfig: { id: string; language?: string; name?: string } | undefined,
  onVideoProcessed: (
    video: { id: string; title: string },
    result: 'added' | 'updated' | 'skipped' | 'already_scraped' | FailureReason
  ) => Promise<void>,
  onPageComplete: () => Promise<void>,
  onProgress?: (progress: { current: number; total: number; message: string }) => void
) {
  // Get YouTube Data API key from environment
  const youtubeApiKey = process.env.YOUTUBE_API_KEY

  if (!youtubeApiKey) {
    throw new Error(
      'YOUTUBE_API_KEY environment variable is required. Get one from https://console.cloud.google.com/apis/credentials'
    )
  }

  // Get channel info using youtubei.js
  let channel
  if (channelIdentifier.startsWith('UC')) {
    channel = await youtube.getChannel(channelIdentifier)
    if (!channel) {
      throw new Error(`Channel not found: ${channelIdentifier}`)
    }
  }

  console.log(
    'Channel:',
    (channel && typeof channel === 'object' && 'header' in channel && channel.header
      ? (
          channel.header as {
            author?: { name?: string }
          }
        )?.author?.name
      : undefined) || channelIdentifier
  )

  // Build set of already scraped video IDs for this channel
  const existingVideoIds = new Set<string>()
  for (const [key, entry] of Object.entries(db)) {
    if (key.startsWith('_')) continue
    const movieEntry = entry as MovieEntry
    for (const source of movieEntry.sources || []) {
      if (source.type === 'youtube' && source.channelId === channelIdentifier) {
        existingVideoIds.add(source.id)
      }
    }
  }

  console.log(`Found ${existingVideoIds.size} already scraped videos from this channel`)

  // Use YouTube Data API v3 to get ALL video IDs (no pagination limit)
  const { getChannelVideoIds } = await import('./youtubeDataApi')
  const allVideoIds = await getChannelVideoIds(youtubeApiKey, channelIdentifier)
  console.log(`Total videos in channel: ${allVideoIds.length}`)

  // Filter out already scraped videos
  const newVideoIds = allVideoIds.filter(id => !existingVideoIds.has(id))
  console.log(`New videos to process: ${newVideoIds.length}`)

  let count = 0

  // Process each video using youtubei.js for detailed metadata
  for (const videoId of allVideoIds) {
    onProgress?.({
      current: count,
      total: allVideoIds.length,
      message: `Processing video ${count + 1}/${allVideoIds.length}`,
    })

    // Skip if already scraped
    if (existingVideoIds.has(videoId)) {
      await onVideoProcessed({ id: videoId, title: 'Already scraped' }, 'already_scraped')
      count++
      continue
    }

    try {
      // Fetch full video details using youtubei.js
      const fullVideo = await youtube.getBasicInfo(videoId)

      if (!fullVideo || !fullVideo.basic_info) {
        saveFailedYouTubeVideo({
          videoId,
          channelId: channelIdentifier,
          title: 'Unknown',
          reason: 'missing_data',
        })
        await onVideoProcessed({ id: videoId, title: 'Unknown' }, 'missing_data')
        count++
        continue
      }

      const title = fullVideo.basic_info.title || 'Unknown'
      const duration = fullVideo.basic_info.duration || 0

      // Filter out shorts, trailers, clips
      let skipReason: FailureReason | null = null
      if (
        (fullVideo.basic_info &&
          typeof fullVideo.basic_info === 'object' &&
          'is_short' in fullVideo.basic_info &&
          fullVideo.basic_info.is_short) ||
        title.toLowerCase().includes('#shorts')
      ) {
        skipReason = 'shorts'
      } else if (
        title.toLowerCase().includes('trailer') ||
        title.toLowerCase().includes('clip') ||
        title.toLowerCase().includes('preview')
      ) {
        skipReason = 'trailer_clip'
      }

      if (skipReason) {
        saveFailedYouTubeVideo({
          videoId,
          channelId: channelIdentifier,
          title,
          reason: skipReason,
          duration,
        })
        await onVideoProcessed({ id: videoId, title }, skipReason)
        count++
        continue
      }

      // Filter by duration (configurable minimum)
      const config = useRuntimeConfig()
      const minDuration = (config.minMovieDurationMinutes as number) * 60
      if (duration < minDuration) {
        saveFailedYouTubeVideo({
          videoId,
          channelId: channelIdentifier,
          title,
          reason: 'duration',
          duration,
        })
        await onVideoProcessed({ id: videoId, title }, 'duration')
        count++
        continue
      }

      // Extract thumbnail URL
      const thumbnailUrl = fullVideo.basic_info.thumbnail?.[0]?.url

      const videoData = {
        id: videoId,
        title,
        description: fullVideo.basic_info.short_description || '',
        publishedAt:
          (fullVideo.basic_info &&
          typeof fullVideo.basic_info === 'object' &&
          'upload_date' in fullVideo.basic_info
            ? (fullVideo.basic_info.upload_date as string)
            : '') || '',
        channelName:
          fullVideo.basic_info.author ||
          (channel && typeof channel === 'object' && 'header' in channel && channel.header
            ? (
                channel.header as {
                  author?: { name?: string }
                }
              )?.author?.name
            : undefined) ||
          '',
        channelId: fullVideo.basic_info.channel_id || channelIdentifier,
        thumbnails: {
          high: thumbnailUrl,
        },
        duration,
        viewCount: fullVideo.basic_info.view_count || 0,
      }

      // Process video into movie entry
      const movieEntry = await processYouTubeVideo(videoData, channelConfig)
      if (movieEntry) {
        const existing = db[movieEntry.imdbId]
        const { upsertMovie } = await import('./movieData')
        upsertMovie(db, movieEntry.imdbId, movieEntry)

        const result = existing ? 'updated' : 'added'
        await onVideoProcessed({ id: videoId, title }, result)
        existingVideoIds.add(videoId)

        // Remove from failed list if it was there
        removeFailedYouTubeVideo(videoId)
      }

      count++
    } catch (error) {
      console.error(`Failed to fetch video ${videoId}:`, error)
      saveFailedYouTubeVideo({
        videoId,
        channelId: channelIdentifier,
        title: 'Error',
        reason: 'api_error',
      })
      await onVideoProcessed({ id: videoId, title: 'Error' }, 'api_error')
      count++
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))

    // Save progress every 10 videos
    if (count % 10 === 0) {
      await onPageComplete()
    }
  }

  // Final save
  await onPageComplete()

  console.log(`Finished scraping channel. Total processed: ${count}`)
}

export async function processYouTubeVideo(
  video: {
    id: string
    title: string
    description?: string
    publishedAt?: string
    channelName: string
    channelId: string
    thumbnails?: { high?: string }
    duration?: number
    viewCount?: number
  },
  channelConfig: { id: string; language?: string } | undefined
): Promise<MovieEntry | null> {
  // Keep original title for storage
  const originalTitle = video.title
  const { year: parsedYear } = parseMovieTitle(originalTitle)

  const source: YouTubeSource = {
    type: 'youtube',
    id: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    title: originalTitle, // Store original title in source
    channelName: video.channelName,
    channelId: video.channelId,
    description: video.description,
    releaseYear: parsedYear,
    language: channelConfig?.language,
    publishedAt: video.publishedAt,
    duration: video.duration,
    viewCount: video.viewCount,
    thumbnail: video.thumbnails?.high,
    addedAt: new Date().toISOString(),
  }

  // Always use generated YouTube ID - OMDB enrichment is done separately
  const imdbId: string = generateYouTubeId(video.id)

  return {
    imdbId,
    title: originalTitle, // Store original title
    year: parsedYear,
    sources: [source],
    metadata: undefined, // No metadata during scraping
    lastUpdated: new Date().toISOString(),
  }
}
