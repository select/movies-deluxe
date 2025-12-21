/**
 * OMDB API matcher for finding IMDB IDs and metadata
 */

import type {
  OMDBSearchResponse,
  OMDBSearchResult,
  MovieMetadata,
  MatchResult,
  MatchConfidence,
} from '../../types/movie.ts'
import { createLogger } from './logger.ts'

const logger = createLogger('OMDBMatcher')

// Rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 250 // 250ms between requests (4 per second, well under 1000/day limit)

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Rate-limited fetch with retry logic
 */
async function rateLimitedFetch(url: string, retries = 3): Promise<Response> {
  // Enforce rate limiting
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest)
  }
  lastRequestTime = Date.now()

  // Attempt fetch with retries
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response
      }
      if (response.status === 429) {
        // Rate limited - wait longer
        logger.warn('Rate limited by OMDB, waiting 5 seconds...')
        await sleep(5000)
        continue
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (error) {
      if (i === retries - 1) throw error
      logger.warn(`Request failed, retrying (${i + 1}/${retries})...`)
      await sleep(1000 * (i + 1)) // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded')
}

/**
 * Search OMDB for a movie by title and optional year
 */
export async function searchOMDB(
  title: string,
  year?: number,
  apiKey?: string
): Promise<OMDBSearchResponse> {
  if (!apiKey) {
    throw new Error('OMDB API key is required')
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    s: title,
    type: 'movie',
  })

  if (year) {
    params.set('y', year.toString())
  }

  const url = `https://www.omdbapi.com/?${params.toString()}`

  try {
    const response = await rateLimitedFetch(url)
    const data = (await response.json()) as OMDBSearchResponse

    if (data.Response === 'False') {
      logger.debug(`No results for "${title}" ${year ? `(${year})` : ''}: ${data.Error}`)
    }

    return data
  } catch (error) {
    logger.error(`OMDB search failed for "${title}":`, error)
    throw error
  }
}

/**
 * Get detailed movie information by IMDB ID
 */
export async function getMovieByImdbId(
  imdbId: string,
  apiKey?: string
): Promise<MovieMetadata | null> {
  if (!apiKey) {
    throw new Error('OMDB API key is required')
  }

  const url = `https://www.omdbapi.com/?apikey=${apiKey}&i=${imdbId}&plot=full`

  try {
    const response = await rateLimitedFetch(url)
    const data = (await response.json()) as MovieMetadata

    if (data.response === 'False') {
      logger.warn(`Movie not found: ${imdbId}`)
      return null
    }

    return data
  } catch (error) {
    logger.error(`Failed to fetch movie ${imdbId}:`, error)
    throw error
  }
}

/**
 * Calculate match confidence between search result and original title/year
 */
function calculateConfidence(
  originalTitle: string,
  originalYear: number | undefined,
  result: OMDBSearchResult
): MatchConfidence {
  const resultTitle = result.Title.toLowerCase()
  const searchTitle = originalTitle.toLowerCase()

  // Year matching - CRITICAL for disambiguation
  const yearMatches = originalYear && result.Year === originalYear.toString()
  const yearMismatch = originalYear && result.Year !== originalYear.toString()

  // Exact title match
  if (resultTitle === searchTitle) {
    if (yearMatches) {
      return 'exact' as MatchConfidence
    }
    // If year is provided but doesn't match, downgrade confidence
    if (yearMismatch) {
      return 'medium' as MatchConfidence
    }
    return 'high' as MatchConfidence
  }

  // Title contains search term or vice versa
  if (resultTitle.includes(searchTitle) || searchTitle.includes(resultTitle)) {
    if (yearMatches) {
      return 'high' as MatchConfidence
    }
    // If year is provided but doesn't match, downgrade confidence
    if (yearMismatch) {
      return 'low' as MatchConfidence
    }
    return 'medium' as MatchConfidence
  }

  // Similar words (basic fuzzy matching)
  const originalWords = searchTitle.split(/\s+/)
  const resultWords = resultTitle.split(/\s+/)
  const matchingWords = originalWords.filter(w => resultWords.includes(w))

  if (matchingWords.length >= Math.min(originalWords.length, resultWords.length) * 0.6) {
    // Even with fuzzy matching, year mismatch should downgrade
    if (yearMismatch) {
      return 'low' as MatchConfidence
    }
    return 'medium' as MatchConfidence
  }

  return 'low' as MatchConfidence
}

/**
 * Match a movie title and year to an IMDB ID
 */
export async function matchMovie(
  title: string,
  year?: number,
  apiKey?: string
): Promise<MatchResult> {
  // Validate title
  if (!title || typeof title !== 'string' || title.trim() === '') {
    logger.warn(`Invalid title provided to matchMovie: ${JSON.stringify(title)}`)
    return {
      confidence: 'none' as MatchConfidence,
    }
  }

  try {
    // Search OMDB
    const searchResults = await searchOMDB(title, year, apiKey)

    if (!searchResults.Search || searchResults.Search.length === 0) {
      return {
        confidence: 'none' as MatchConfidence,
      }
    }

    // Find best match
    let bestMatch: OMDBSearchResult | null = null
    let bestConfidence: MatchConfidence = 'none' as MatchConfidence

    for (const result of searchResults.Search) {
      const confidence = calculateConfidence(title, year, result)

      // Priority order: exact > high > medium > low
      const confidencePriority = {
        exact: 4,
        high: 3,
        medium: 2,
        low: 1,
        none: 0,
      }
      if (confidencePriority[confidence] > confidencePriority[bestConfidence]) {
        bestMatch = result
        bestConfidence = confidence
      }
    }

    if (!bestMatch) {
      return {
        confidence: 'none' as MatchConfidence,
      }
    }

    logger.info(
      `Matched "${title}" to "${bestMatch.Title}" (${bestMatch.Year}) with ${bestConfidence} confidence`
    )

    // Fetch full metadata for the best match
    const metadata = await getMovieByImdbId(bestMatch.imdbID, apiKey)

    return {
      confidence: bestConfidence,
      imdbId: bestMatch.imdbID,
      title: bestMatch.Title,
      year: bestMatch.Year,
      metadata: metadata || undefined,
    }
  } catch (error) {
    logger.error(`Match failed for "${title}":`, error)
    return {
      confidence: 'none' as MatchConfidence,
    }
  }
}

/**
 * Batch match multiple movies with progress tracking
 */
export async function batchMatchMovies(
  movies: Array<{ title: string; year?: number }>,
  apiKey?: string,
  onProgress?: (current: number, total: number) => void
): Promise<MatchResult[]> {
  const results: MatchResult[] = []

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i]
    const result = await matchMovie(movie.title, movie.year, apiKey)
    results.push(result)

    if (onProgress) {
      onProgress(i + 1, movies.length)
    }
  }

  return results
}
