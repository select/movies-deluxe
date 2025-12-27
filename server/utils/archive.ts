import { generateArchiveId, type ArchiveOrgSource, type MovieEntry } from '../../shared/types/movie'

export interface ArchiveOrgMovie {
  title: string
  identifier: string
  description?: string
  date?: string
  year?: string
  runtime?: string | string[]
  length?: string | string[]
  downloads?: number
  collection?: string[]
  language?: string // 2-letter language code from Archive.org metadata
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
    'identifier,title,description,date,year,downloads,collection,language,runtime,length'
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
export function extractYear(date?: string): number | undefined {
  if (!date) return undefined
  const yearMatch = date.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    return parseInt(yearMatch[0])
  }
  return undefined
}

/**
 * Parse Archive.org duration formats into seconds
 */
export function parseArchiveDuration(runtime: string | string[]): number | null {
  const runtimeStr = Array.isArray(runtime) ? runtime[0] : runtime
  if (!runtimeStr) return null

  // Try parsing as seconds (pure numeric string)
  if (/^\d+$/.test(runtimeStr)) {
    return parseInt(runtimeStr, 10)
  }

  // Try parsing as HH:MM:SS or MM:SS
  const parts = runtimeStr.split(':').map(p => parseInt(p, 10))
  if (parts.length === 3 && parts.every(p => !isNaN(p))) {
    // HH:MM:SS
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  } else if (parts.length === 2 && parts.every(p => !isNaN(p))) {
    // MM:SS
    return parts[0]! * 60 + parts[1]!
  }

  return null
}

/**
 * Process a single Archive.org movie
 */
export async function processArchiveMovie(
  movie: ArchiveOrgMovie,
  collection: string
): Promise<MovieEntry | null> {
  const year = extractYear(movie.date || movie.year)
  const duration = parseArchiveDuration(movie.runtime || movie.length || '')

  const source: ArchiveOrgSource = {
    type: 'archive.org',
    id: movie.identifier,
    url: `https://archive.org/details/${movie.identifier}`,
    title: movie.title, // Original title from Archive.org
    collection,
    downloads: movie.downloads,
    description: movie.description,
    thumbnail: `https://archive.org/services/img/${movie.identifier}`,
    duration: duration || undefined,
    releaseDate: movie.date || movie.year,
    language: movie.language, // 2-letter language code from Archive.org metadata
    addedAt: new Date().toISOString(),
  }

  // Always use generated Archive ID - OMDB enrichment is done separately
  const imdbId: string = generateArchiveId(movie.identifier)

  const entry: MovieEntry = {
    imdbId,
    title: movie.title, // Store original title
    year,
    sources: [source],
    metadata: undefined, // No metadata during scraping
    lastUpdated: new Date().toISOString(),
  }

  console.log(`[Archive] Created movie entry: "${entry.title}"`)

  return entry
}
