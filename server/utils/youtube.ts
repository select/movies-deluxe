import type { Client } from 'youtubei'
import { generateYouTubeId, type YouTubeSource, type MovieEntry } from '../../shared/types/movie'

export function parseMovieTitle(title: string): { title: string; year?: number } {
  let cleanTitle = title
    .replace(/\s*\|\s*Full Movie.*$/i, '')
    .replace(/\s*-\s*Full Movie.*$/i, '')
    .replace(/\s*\[Full Movie\].*$/i, '')
    .replace(/\s*\(Full Movie\).*$/i, '')
    .replace(/\s*Full HD.*$/i, '')
    .replace(/\s*4K.*$/i, '')

  const yearPatterns = [/\((\d{4})\)/, /\[(\d{4})\]/, /\|\s*(\d{4})/, /-\s*(\d{4})/, /\s+(\d{4})$/]

  let year: number | undefined
  for (const pattern of yearPatterns) {
    const match = cleanTitle.match(pattern)
    if (match && match[1]) {
      const parsedYear = parseInt(match[1])
      if (parsedYear >= 1900 && parsedYear <= 2030) {
        year = parsedYear
        cleanTitle = cleanTitle.replace(pattern, '').trim()
        break
      }
    }
  }

  cleanTitle = cleanTitle
    .replace(/\s+/g, ' ')
    .replace(/[|-]\s*$/, '')
    .trim()

  return { title: cleanTitle, year }
}

export async function fetchChannelVideos(
  youtube: Client,
  channelIdentifier: string,
  db: any, // MoviesDatabase
  channelConfig: { id: string; language?: string } | undefined,
  onVideoProcessed: (
    video: { id: string; title: string },
    result: 'added' | 'updated' | 'skipped'
  ) => Promise<void>,
  onPageComplete: () => Promise<void>,
  onProgress?: (progress: { current: number; total: number; message: string }) => void
) {
  let channel

  // If it's a channel ID (starts with UC), use getChannel() directly
  if (channelIdentifier.startsWith('UC')) {
    channel = await youtube.getChannel(channelIdentifier)
    if (!channel) {
      throw new Error(`Channel not found: ${channelIdentifier}`)
    }
  }

  console.log('got channel', channel)
  if (!channel || !channel.videos) return

  // Build set of already scraped video IDs for this channel
  const existingVideoIds = new Set<string>()
  for (const [key, entry] of Object.entries(db)) {
    if (key.startsWith('_')) continue
    const movieEntry = entry as any
    for (const source of movieEntry.sources || []) {
      if (source.type === 'youtube' && source.channelId === channelIdentifier) {
        existingVideoIds.add(source.videoId)
      }
    }
  }

  console.log(`Found ${existingVideoIds.size} already scraped videos from this channel`)

  let count = 0
  let hasMore = true

  while (hasMore) {
    const videoList = await channel.videos.next()
    if (!videoList || videoList.length === 0) {
      hasMore = false
      break
    }

    for (const video of videoList) {
      // Defensive: Skip videos with missing critical data
      if (!video || !video.id || !video.title) {
        console.warn('Skipping video with missing data:', { id: video?.id, title: video?.title })
        continue
      }

      const title = video.title

      const progressMsg = `Checking: ${title}`
      onProgress?.({ current: count, total: 0, message: progressMsg })

      // Skip if already scraped
      if (existingVideoIds.has(video.id)) {
        await onVideoProcessed({ id: video.id, title }, null as any)
        count++
        continue
      }

      // Filter out shorts, trailers, clips
      if (
        title.toLowerCase().includes('#shorts') ||
        title.toLowerCase().includes('trailer') ||
        title.toLowerCase().includes('clip') ||
        title.toLowerCase().includes('preview') ||
        video.isShort
      ) {
        continue
      }

      // Filter by duration (minimum 40 minutes)
      const duration = video.duration || 0
      if (duration < 40 * 60) continue

      try {
        const fullVideo = await youtube.getVideo(video.id)

        // Safely extract thumbnail URL
        let thumbnailUrl: string | undefined
        if (video.thumbnails && Array.isArray(video.thumbnails)) {
          thumbnailUrl =
            video.thumbnails[2]?.url || video.thumbnails[1]?.url || video.thumbnails[0]?.url
        }

        const videoData = {
          id: video.id,
          title,
          description: fullVideo?.description || '',
          publishedAt: video.uploadDate || '',
          channelName: channel.name || '',
          channelId: channel.id || '',
          thumbnails: {
            high: thumbnailUrl,
          },
          duration,
          viewCount: video.viewCount || 0,
        }

        // Process video into movie entry
        const movieEntry = await processYouTubeVideo(videoData, channelConfig)
        if (movieEntry) {
          const existing = db[movieEntry.imdbId]
          const { upsertMovie } = await import('./movieData')
          upsertMovie(db, movieEntry.imdbId, movieEntry)

          const result = existing ? 'updated' : 'added'
          await onVideoProcessed({ id: video.id, title }, result)
          existingVideoIds.add(video.id)
        }

        count++
      } catch (error) {
        console.error(`Failed to fetch video ${video.id}:`, error)
        // Continue with next video instead of failing entire scrape
      }

      await new Promise(resolve => setTimeout(resolve, 200))
    }

    // Save after each page
    await onPageComplete()
  }
}

export async function getChannelVideoCount(
  youtube: Client,
  channelIdentifier: string
): Promise<number> {
  try {
    let channelId = channelIdentifier

    // If it's a handle (starts with @), search for the channel first
    if (channelIdentifier.startsWith('@')) {
      const searchQuery = channelIdentifier.slice(1)
      const searchResults = await youtube.search(searchQuery, { type: 'channel' })
      const channelResult = searchResults.items[0]
      if (!channelResult) {
        console.error(`Channel not found: ${channelIdentifier}`)
        return 0
      }
      channelId = channelResult.id || ''
    }

    const channel = await (youtube as any).getChannel(channelId)
    if (channel && 'videoCount' in channel) {
      const countStr = (channel as any).videoCount as string
      // Parse "2.8K videos" or "150 videos" or "1,234 videos"
      const match = countStr.replace(/,/g, '').match(/([\d.]+)\s*([KM])?/)
      if (match && match[1]) {
        let total = parseFloat(match[1])
        if (match[2] === 'K') total *= 1000
        if (match[2] === 'M') total *= 1000000
        return Math.floor(total)
      }
    }
  } catch (e) {
    console.error(`Failed to fetch total for channel ${channelIdentifier}`, e)
  }
  return 0
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
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
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
