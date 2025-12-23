import { Client } from 'youtubei'
import { generateYouTubeId, type YouTubeSource, type MovieEntry } from '../../shared/types/movie'
import { matchMovie } from './omdb'

export interface TitleCleaningPattern {
  regex: RegExp
  replacement?: string
  extractor?: (match: RegExpMatchArray) => string | null
  description: string
}

export interface TitleCleaningRule {
  channelId: string
  channelName: string
  patterns: TitleCleaningPattern[]
}

export const TITLE_CLEANING_RULES: TitleCleaningRule[] = [
  {
    channelId: '@Netzkino',
    channelName: 'Netzkino',
    patterns: [
      {
        regex: /^Watch\s+/i,
        replacement: '',
        description: 'Remove "Watch" prefix',
      },
      {
        regex:
          /\s*\([^)]*(?:full.*?movie|movie.*?full|comedy|drama|thriller|horror|film|classic|ganzer film|romantic|family|animal)[^)]*\)\s*$/i,
        replacement: '',
        description: 'Remove promotional text in parentheses at end',
      },
    ],
  },
  {
    channelId: '@FilmRiseMovies',
    channelName: 'FilmRise Movies',
    patterns: [
      {
        regex: /\s*\|\s*(?:Free Full|Part \d+ of \d+).*$/i,
        replacement: '',
        description: 'Remove branding and part indicators after pipe',
      },
    ],
  },
  {
    channelId: '@Popcornflix',
    channelName: 'Popcornflix',
    patterns: [
      {
        regex: /\s*(?:\(\d{4}\))?\s*\|\s*(?:Part \d+ of \d+\s*\|)?\s*FULL MOVIE.*$/i,
        replacement: '',
        description: 'Remove year, part indicators, FULL MOVIE, and genre info',
      },
    ],
  },
  {
    channelId: '@MovieCentral',
    channelName: 'Movie Central',
    patterns: [
      {
        regex: /^[^|]+\|\s*([^|]+?)(?:\s*\|\s*(?:HD|20\d{2}).*)?$/,
        extractor: match => match[1]?.trim() || null,
        description: 'Extract alternate title (second part between pipes)',
      },
      {
        regex: /\s*\|\s*(?:HD|20\d{2}).*$/i,
        replacement: '',
        description: 'Fallback: remove HD/year patterns',
      },
    ],
  },
  {
    channelId: '@TimelessClassicMovies',
    channelName: 'Timeless Classic Movies',
    patterns: [
      {
        regex: /\s*\[[^\]]+\]\s*/g,
        replacement: '',
        description: 'Remove all [Genre] tags',
      },
    ],
  },
  {
    channelId: '@Mosfilm',
    channelName: 'Mosfilm',
    patterns: [
      {
        regex: /\s*\|\s*[A-Za-z]+(?:\s*\|.*)?$/,
        replacement: '',
        description: 'Remove genre and subtitle info after pipe',
      },
    ],
  },
  {
    channelId: '@Moviedome',
    channelName: 'Moviedome',
    patterns: [
      {
        regex: /.*:\s*([^(]+?)(?:\s*\(Ganzer Film.*)?$/,
        extractor: match => match[1]?.trim() || null,
        description: 'Extract title after colon, before (Ganzer Film)',
      },
      {
        regex: /\s*\(Ganzer Film[^)]*\)\s*$/i,
        replacement: '',
        description: 'Fallback: remove (Ganzer Film...) suffix',
      },
    ],
  },
]

export function cleanTitle(title: string, channelId: string): string {
  const rule = TITLE_CLEANING_RULES.find(r => r.channelId === channelId)
  if (!rule) return title.trim()

  let cleanedTitle = title
  for (const pattern of rule.patterns) {
    if (pattern.extractor) {
      const match = cleanedTitle.match(pattern.regex)
      if (match) {
        const extracted = pattern.extractor(match)
        if (extracted) {
          cleanedTitle = extracted
          break
        }
      }
    } else {
      cleanedTitle = cleanedTitle.replace(pattern.regex, pattern.replacement || '')
    }
  }
  return cleanedTitle.trim() || title.trim()
}

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
  limit: number
) {
  const searchQuery = channelIdentifier.startsWith('@')
    ? channelIdentifier.slice(1)
    : channelIdentifier

  const searchResults = await youtube.search(searchQuery, { type: 'channel' })
  if (!searchResults.items || searchResults.items.length === 0) {
    throw new Error(`Channel not found: ${channelIdentifier}`)
  }

  const channel = searchResults.items[0]
  if (!channel || !channel.videos) return []
  const videoList = await channel.videos.next()
  if (!videoList || videoList.length === 0) return []

  const results = []
  let count = 0

  for (const video of videoList) {
    if (count >= limit) break
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

    const duration = video.duration || 0
    if (duration < 40 * 60) continue

    const fullVideo = await youtube.getVideo(video.id)
    results.push({
      id: video.id,
      title,
      description: fullVideo?.description || '',
      publishedAt: video.uploadDate || '',
      channelName: channel.name || '',
      channelId: channel.id || '',
      thumbnails: {
        high:
          video.thumbnails?.[2]?.url || video.thumbnails?.[1]?.url || video.thumbnails?.[0]?.url,
      },
      duration,
      viewCount: video.viewCount || 0,
    })
    count++
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return results
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
  channelConfig: { id: string; language?: string } | undefined,
  options: { skipOmdb: boolean; omdbApiKey?: string }
): Promise<MovieEntry | null> {
  const cleanedTitle = channelConfig ? cleanTitle(video.title, channelConfig.id) : video.title
  const { title, year } = parseMovieTitle(cleanedTitle)

  const source: YouTubeSource = {
    type: 'youtube',
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    channelName: video.channelName,
    channelId: video.channelId,
    description: video.description,
    releaseYear: year,
    language: channelConfig?.language,
    publishedAt: video.publishedAt,
    duration: video.duration,
    viewCount: video.viewCount,
    thumbnail: video.thumbnails?.high,
    addedAt: new Date().toISOString(),
  }

  let imdbId: string = generateYouTubeId(video.id)
  let metadata = undefined

  if (!options.skipOmdb && options.omdbApiKey) {
    const matchResult = await matchMovie(title, year, options.omdbApiKey)
    if (matchResult.confidence !== 'none' && matchResult.imdbId) {
      imdbId = matchResult.imdbId
      metadata = matchResult.metadata
    }
  }

  return {
    imdbId,
    title,
    year,
    sources: [source],
    metadata,
    lastUpdated: new Date().toISOString(),
  }
}
