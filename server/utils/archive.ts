import { generateArchiveId, type ArchiveOrgSource, type MovieEntry } from '../../shared/types/movie'
import { matchMovie } from './omdb'

export interface ArchiveOrgMovie {
  title: string
  identifier: string
  description?: string
  date?: string
  year?: string
  downloads?: number
  collection?: string[]
}

export interface ArchiveOrgResponse {
  response: {
    docs: ArchiveOrgMovie[]
    numFound: number
  }
}

/**
 * Fetch movies from Archive.org
 */
export async function fetchArchiveOrgMovies(
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
  url.searchParams.set(
    'fl',
    'identifier,title,description,date,year,downloads,collection,mediatype'
  )

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as ArchiveOrgResponse
    return data.response.docs || []
  } catch (error) {
    console.error(`Failed to fetch from ${collection}:`, error)
    return []
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
  collection: string,
  options: { skipOmdb: boolean; omdbApiKey?: string }
): Promise<MovieEntry | null> {
  const year = extractYear(movie.date || movie.year)

  const source: ArchiveOrgSource = {
    type: 'archive.org',
    identifier: movie.identifier,
    url: `https://archive.org/details/${movie.identifier}`,
    collection,
    downloads: movie.downloads,
    description: movie.description,
    thumbnail: `https://archive.org/services/img/${movie.identifier}`,
    releaseDate: movie.date || movie.year,
    addedAt: new Date().toISOString(),
  }

  let imdbId: string = generateArchiveId(movie.identifier)
  let metadata = undefined

  if (!options.skipOmdb && options.omdbApiKey) {
    const matchResult = await matchMovie(movie.title, year, options.omdbApiKey)

    if (matchResult.confidence !== 'none' && matchResult.imdbId) {
      imdbId = matchResult.imdbId
      metadata = matchResult.metadata
    }
  }

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
