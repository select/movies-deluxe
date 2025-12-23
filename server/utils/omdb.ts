import type {
  OMDBSearchResponse,
  OMDBSearchResult,
  MovieMetadata,
  MatchResult,
  MatchConfidence,
} from '../../shared/types/movie'

// Rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 250 // 250ms between requests

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
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest)
  }
  lastRequestTime = Date.now()

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response
      }
      if (response.status === 429) {
        await sleep(5000)
        continue
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (error) {
      if (i === retries - 1) throw error
      await sleep(1000 * (i + 1))
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
    return (await response.json()) as OMDBSearchResponse
  } catch (error) {
    console.error(`OMDB search failed for "${title}":`, error)
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

    if (data.Response === 'False') {
      return null
    }

    return data
  } catch (error) {
    console.error(`Failed to fetch movie ${imdbId}:`, error)
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
  const omdbYearNum = result.Year ? parseInt(result.Year, 10) : 0

  if (originalYear) {
    const omdbYear = result.Year
    if (!omdbYear || omdbYear === 'N/A') {
      return 'none' as MatchConfidence
    }
    if (Math.abs(omdbYearNum - originalYear) > 2) {
      return 'none' as MatchConfidence
    }
  }

  const exactYearMatch = originalYear && omdbYearNum === originalYear

  if (resultTitle === searchTitle) {
    if (exactYearMatch) {
      return 'exact' as MatchConfidence
    }
    return 'high' as MatchConfidence
  }

  if (resultTitle.includes(searchTitle) || searchTitle.includes(resultTitle)) {
    if (exactYearMatch) {
      return 'high' as MatchConfidence
    }
    return 'medium' as MatchConfidence
  }

  const originalWords = searchTitle.split(/\s+/)
  const resultWords = resultTitle.split(/\s+/)
  const matchingWords = originalWords.filter(w => resultWords.includes(w))

  if (matchingWords.length >= Math.min(originalWords.length, resultWords.length) * 0.6) {
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
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return {
      confidence: 'none' as MatchConfidence,
    }
  }

  try {
    const searchResults = await searchOMDB(title, undefined, apiKey)

    if (!searchResults.Search || searchResults.Search.length === 0) {
      return {
        confidence: 'none' as MatchConfidence,
      }
    }

    const confidencePriority = {
      exact: 4,
      high: 3,
      medium: 2,
      low: 1,
      none: 0,
    }

    const { bestMatch, bestConfidence } = searchResults.Search.reduce(
      (
        best: { bestMatch: OMDBSearchResult | null; bestConfidence: MatchConfidence },
        result: OMDBSearchResult
      ) => {
        const confidence = calculateConfidence(title, year, result)
        if (confidencePriority[confidence] > confidencePriority[best.bestConfidence]) {
          return { bestMatch: result, bestConfidence: confidence }
        }
        return best
      },
      { bestMatch: null as OMDBSearchResult | null, bestConfidence: 'none' as MatchConfidence }
    )

    if (!bestMatch) {
      return {
        confidence: 'none' as MatchConfidence,
      }
    }

    const metadata = await getMovieByImdbId(bestMatch.imdbID, apiKey)

    return {
      confidence: bestConfidence,
      imdbId: bestMatch.imdbID,
      title: bestMatch.Title,
      year: bestMatch.Year,
      metadata: metadata || undefined,
    }
  } catch (error) {
    console.error(`Match failed for "${title}":`, error)
    return {
      confidence: 'none' as MatchConfidence,
    }
  }
}
