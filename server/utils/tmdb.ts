/**
 * TMDB (The Movie Database) API Integration
 *
 * Provides rate-limited movie search and detailed metadata lookup
 * using TMDB API v3 with Bearer token authentication.
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const MIN_REQUEST_INTERVAL_MS = 100 // <= 10 req/sec
const MAX_RETRIES = 3

let lastRequestTime = 0
let requestQueue: Promise<void> = Promise.resolve()

export interface TmdbSearchResult {
  id: number
  title: string
  originalTitle?: string
  releaseDate?: string
  year?: number
  overview?: string
  originalLanguage?: string
  popularity?: number
}

export interface TmdbMovieDetails {
  tmdbId: number
  imdbId: string | null
  title: string
  originalTitle?: string
  year?: number
  runtime?: number
  directors: string[]
  cast: string[]
  altTitles: string[]
  overview?: string
  language?: string
}

export type TmdbCandidate = TmdbMovieDetails

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getTmdbToken(): string | undefined {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim()
  return token || undefined
}

/**
 * Check if TMDB API is configured
 */
export function isTmdbAvailable(): boolean {
  return Boolean(getTmdbToken())
}

/**
 * Serialize and rate-limit TMDB requests to <= 10 req/sec with exponential backoff on 429/5xx
 */
async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const token = getTmdbToken()
  if (!token) {
    return null
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const runRequest = async (): Promise<T | null> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const now = Date.now()
      const elapsed = now - lastRequestTime
      if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - elapsed)
      }
      lastRequestTime = Date.now()

      try {
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        })

        if (response.ok) {
          return (await response.json()) as T
        }

        if (response.status === 404) {
          return null
        }

        if (response.status === 429 || response.status >= 500) {
          if (attempt === MAX_RETRIES) {
            console.warn(`[TMDB] Failed after ${MAX_RETRIES + 1} attempts: HTTP ${response.status}`)
            return null
          }
          const retryAfterHeader = response.headers.get('retry-after')
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
          const backoffMs =
            !Number.isNaN(retryAfterMs) && retryAfterMs > 0
              ? retryAfterMs
              : 500 * Math.pow(2, attempt)
          await sleep(backoffMs)
          continue
        }

        console.warn(`[TMDB] HTTP ${response.status} for ${path}`)
        return null
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[TMDB] Request error for ${path}:`, error)
          return null
        }
        await sleep(500 * Math.pow(2, attempt))
      }
    }

    return null
  }

  const resultPromise = requestQueue.then(runRequest, runRequest)
  requestQueue = resultPromise.then(
    () => undefined,
    () => undefined
  )
  return resultPromise
}

function parseYear(dateStr?: string | null): number | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined
  const match = dateStr.match(/^(\d{4})/)
  if (!match?.[1]) return undefined
  const year = parseInt(match[1], 10)
  return Number.isNaN(year) ? undefined : year
}

interface TmdbSearchApiResponse {
  results?: Array<{
    id: number
    title?: string
    original_title?: string
    release_date?: string
    overview?: string
    original_language?: string
    popularity?: number
  }>
}

/**
 * Search TMDB movies by title, optional year, and optional language
 */
export async function searchTmdbMovie(
  query: string,
  year?: number,
  language?: string
): Promise<TmdbSearchResult[]> {
  if (!isTmdbAvailable() || !query.trim()) {
    return []
  }

  const params: Record<string, string> = {
    query: query.trim(),
    include_adult: 'false',
  }
  if (year) {
    params.year = String(year)
  }
  if (language) {
    params.language = language
  }

  const data = await tmdbFetch<TmdbSearchApiResponse>('/search/movie', params)
  if (!data?.results) {
    return []
  }

  return data.results.map(item => ({
    id: item.id,
    title: item.title || item.original_title || '',
    originalTitle: item.original_title || undefined,
    releaseDate: item.release_date || undefined,
    year: parseYear(item.release_date),
    overview: item.overview || undefined,
    originalLanguage: item.original_language || undefined,
    popularity: item.popularity,
  }))
}

interface TmdbDetailsApiResponse {
  id: number
  imdb_id?: string | null
  title?: string
  original_title?: string
  release_date?: string
  runtime?: number | null
  overview?: string | null
  original_language?: string | null
  external_ids?: {
    imdb_id?: string | null
  }
  credits?: {
    cast?: Array<{ name?: string; order?: number }>
    crew?: Array<{ name?: string; job?: string }>
  }
  alternative_titles?: {
    titles?: Array<{ title?: string }>
  }
}

/**
 * Get full TMDB movie details including IMDb ID, credits, and alternative titles
 */
export async function getTmdbMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
  if (!isTmdbAvailable() || !Number.isFinite(tmdbId)) {
    return null
  }

  const data = await tmdbFetch<TmdbDetailsApiResponse>(`/movie/${tmdbId}`, {
    append_to_response: 'external_ids,credits,alternative_titles',
  })

  if (!data) {
    return null
  }

  const imdbId = data.external_ids?.imdb_id || data.imdb_id || null
  const directors = Array.from(
    new Set(
      (data.credits?.crew || [])
        .filter(c => c.job === 'Director' && typeof c.name === 'string' && c.name.trim())
        .map(c => c.name!.trim())
    )
  )

  const cast = (data.credits?.cast || [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 10)
    .map(c => c.name?.trim())
    .filter((name): name is string => Boolean(name))

  const altTitles = Array.from(
    new Set(
      (data.alternative_titles?.titles || [])
        .map(t => t.title?.trim())
        .filter((t): t is string => Boolean(t))
    )
  )

  return {
    tmdbId: data.id,
    imdbId: imdbId && /^tt\d+$/i.test(imdbId) ? imdbId.toLowerCase() : null,
    title: data.title || data.original_title || '',
    originalTitle: data.original_title || undefined,
    year: parseYear(data.release_date),
    runtime: typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : undefined,
    directors,
    cast,
    altTitles,
    overview: data.overview || undefined,
    language: data.original_language || undefined,
  }
}

/**
 * Search TMDB and enrich top candidates with full details (including IMDb ID)
 */
export async function searchTmdbCandidates(
  query: string,
  year?: number,
  limit = 5
): Promise<TmdbCandidate[]> {
  if (!isTmdbAvailable() || !query.trim()) {
    return []
  }

  let searchResults = await searchTmdbMovie(query, year)
  if (searchResults.length === 0 && year) {
    searchResults = await searchTmdbMovie(query)
  }

  const topResults = searchResults.slice(0, Math.max(1, limit))
  const candidates: TmdbCandidate[] = []

  for (const result of topResults) {
    const details = await getTmdbMovieDetails(result.id)
    if (details && details.imdbId) {
      candidates.push(details)
    }
  }

  return candidates
}
