import { generateArchiveId, type ArchiveOrgSource, type MovieEntry } from '../../shared/types/movie'

export interface ArchiveOrgMovie {
  title: string
  identifier: string
  description?: string
  date?: string
  year?: string
  downloads?: number
  collection?: string[]
  language?: string // 2-letter language code from Archive.org metadata
  item_size?: number // File size in bytes
  format?: string | string[] // Available file formats from Archive.org Scrape API
  mediatype?: string
}

export interface ArchiveOrgFile {
  name?: string
  format?: string
  size?: string | number
  length?: string | number
  source?: string
}

export const ARCHIVE_VIDEO_EXT_REGEX =
  /\.(mp4|m4v|ogv|mkv|avi|mpeg|mpg|mov|webm|flv|wmv|3gp|divx)$/i

export const ARCHIVE_VIDEO_FORMAT_REGEX =
  /(mpeg4|h\.264|ogg video|theora|matroska|divx|xvid|quicktime|webm|cinepack|mpeg2|mpeg1|mpeg-ps|mpeg-ts|windows media|flash video|motion jpeg|\bavi\b|\bmp4\b|\bm4v\b|\bflv\b|\bwmv\b|\b3gp\b)/i

/**
 * Check whether an Archive.org Scrape API `format` field contains at least one playable video format.
 */
export function hasPlayableVideoFormat(format?: string | string[] | null): boolean {
  if (!format) return false
  const formats = Array.isArray(format) ? format : [format]
  return formats.some(f => typeof f === 'string' && ARCHIVE_VIDEO_FORMAT_REGEX.test(f))
}

/**
 * Check whether an Archive.org /metadata/<id> `files` array contains at least one playable video file.
 */
export function hasPlayableVideoFile(files?: ArchiveOrgFile[] | null): boolean {
  if (!Array.isArray(files) || files.length === 0) return false
  return files.some(file => {
    const name = typeof file.name === 'string' ? file.name : ''
    const format = typeof file.format === 'string' ? file.format : ''
    return ARCHIVE_VIDEO_EXT_REGEX.test(name) || ARCHIVE_VIDEO_FORMAT_REGEX.test(format)
  })
}

export interface ArchiveOrgResponse {
  items: ArchiveOrgMovie[]
  count: number
  total: number
  cursor?: string
}

/**
 * Fetch movies from Archive.org using the Scrape API
 */
export async function fetchArchiveOrgMovies(
  collection: string,
  rows: number,
  cursor?: string
): Promise<ArchiveOrgResponse> {
  const url = new URL('https://archive.org/services/search/v1/scrape')
  url.searchParams.set('q', `mediatype:movies AND collection:${collection}`)
  url.searchParams.set(
    'fields',
    'identifier,title,description,date,year,downloads,collection,language,item_size,format'
  )
  url.searchParams.set('count', Math.max(100, rows).toString())
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  }

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as ArchiveOrgResponse
    return data
  } catch (error) {
    console.error(`Failed to fetch from ${collection}:`, error)
    return { items: [], count: 0, total: 0 }
  }
}

/**
 * Extract year from Archive.org date field
 */
export function extractYear(date?: string | number | string[]): number | undefined {
  if (date === undefined || date === null) return undefined
  const raw = Array.isArray(date) ? String(date[0] ?? '') : String(date)
  if (!raw) return undefined
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    return parseInt(yearMatch[0])
  }
  return undefined
}

/**
 * Process a single Archive.org movie
 */
export async function processArchiveMovie(
  movie: ArchiveOrgMovie,
  _collection: string
): Promise<MovieEntry | null> {
  // Skip items with no web-playable video format
  if (!hasPlayableVideoFormat(movie.format)) {
    return null
  }

  const year = extractYear(movie.date || movie.year)

  const source: ArchiveOrgSource = {
    type: 'archive.org',
    channelId: 'archive.org',
    id: movie.identifier,
    sourceId: movie.identifier,
    title: movie.title, // Original title from Archive.org
    downloads: movie.downloads,
    description: movie.description,
    year, // Extracted year from Archive.org metadata
    language: movie.language, // 2-letter language code from Archive.org metadata
    size: movie.item_size, // File size in bytes
    addedAt: Math.floor(Date.now() / 1000), // Unix timestamp
  }

  // Always use generated Archive ID - OMDB enrichment is done separately
  const movieId: string = generateArchiveId(movie.identifier)

  const entry: MovieEntry = {
    movieId,
    title: movie.title, // Store original title
    year,
    sources: [source],
    metadata: undefined, // No metadata during scraping
    lastUpdated: new Date().toISOString(),
  }

  return entry
}
