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
    'identifier,title,description,date,year,downloads,collection,language'
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
 * Process a single Archive.org movie
 */
export async function processArchiveMovie(
  movie: ArchiveOrgMovie,
  collection: string
): Promise<MovieEntry | null> {
  const year = extractYear(movie.date || movie.year)

  const source: ArchiveOrgSource = {
    type: 'archive.org',
    id: movie.identifier,
    url: `https://archive.org/details/${movie.identifier}`,
    title: movie.title, // Original title from Archive.org
    collection,
    downloads: movie.downloads,
    description: movie.description,
    thumbnail: `https://archive.org/services/img/${movie.identifier}`,
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
