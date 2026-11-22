/**
 * Multi-Source Candidate Retriever
 *
 * Runs a tiered funnel to retrieve and deduplicate IMDb movie candidates:
 *   1. Direct tt* regex in description / text
 *   2. Local IMDb SQLite index (if built)
 *   3. TMDB API (if TMDB_ACCESS_TOKEN set)
 *   4. IMDb Suggestion API
 *   5. Wikidata API
 *   6. OMDb search (if OMDB_API_KEY available)
 *   7. Free DuckDuckGo HTML search fallback (site:imdb.com/title, when candidates empty)
 *   8. Optional Google CSE tail fallback (only when allowGoogleFallback: true and under 100/day cap)
 */

import { getImdbLocalById, isImdbLocalIndexAvailable, searchImdbLocalIndex } from './imdbLocalIndex'
import { isTmdbAvailable, searchTmdbCandidates } from './tmdb'
import { searchImdbSuggestions } from './imdbSuggestion'
import { searchWikidataImdb } from './wikidata'
import { getMovieByImdbId, searchOMDB } from './omdb'
import { searchDuckDuckGoForImdb } from './duckduckgoSearch'
import { getGoogleQuotaStatus, searchGoogleForImdb } from './googleSearch'

export type CandidateSourceTag =
  | 'description_regex'
  | 'imdb_local'
  | 'tmdb'
  | 'imdb_suggestion'
  | 'wikidata'
  | 'omdb'
  | 'duckduckgo'
  | 'google_cse'

export interface CandidateQueryInput {
  title: string
  originalTitle?: string
  altTitles?: string[]
  year?: number
  description?: string
  language?: string
}

export interface RetrievalOptions {
  limit?: number
  omdbApiKey?: string
  allowDuckDuckGoFallback?: boolean
  allowGoogleFallback?: boolean
  skipExternalApis?: boolean
}

export interface RetrievedCandidate {
  imdbId: string
  title: string
  originalTitle?: string
  altTitles: string[]
  year?: number
  runtimeMinutes?: number
  titleType?: string
  directors: string[]
  cast: string[]
  overview?: string
  language?: string
  sources: CandidateSourceTag[]
}

const IMDB_URL_REGEX = /imdb\.com\/title\/(tt\d{7,9})/i
const IMDB_ID_REGEX = /\b(tt\d{7,9})\b/i

/**
 * Extract an IMDb ID (e.g. tt0012345) from arbitrary text or IMDb URL
 */
export function extractImdbIdFromText(text?: string): string | null {
  if (!text || typeof text !== 'string') {
    return null
  }

  const urlMatch = text.match(IMDB_URL_REGEX)
  if (urlMatch?.[1]) {
    return urlMatch[1].toLowerCase()
  }

  const idMatch = text.match(IMDB_ID_REGEX)
  if (idMatch?.[1]) {
    return idMatch[1].toLowerCase()
  }

  return null
}

function mergeCandidate(
  map: Map<string, RetrievedCandidate>,
  incoming: Omit<RetrievedCandidate, 'sources'> & { source: CandidateSourceTag }
): void {
  const id = incoming.imdbId.toLowerCase()
  const existing = map.get(id)

  if (!existing) {
    map.set(id, {
      imdbId: id,
      title: incoming.title,
      originalTitle: incoming.originalTitle,
      altTitles: Array.from(new Set(incoming.altTitles.filter(Boolean))),
      year: incoming.year,
      runtimeMinutes: incoming.runtimeMinutes,
      titleType: incoming.titleType,
      directors: Array.from(new Set(incoming.directors.filter(Boolean))),
      cast: Array.from(new Set(incoming.cast.filter(Boolean))),
      overview: incoming.overview,
      language: incoming.language,
      sources: [incoming.source],
    })
    return
  }

  if (!existing.sources.includes(incoming.source)) {
    existing.sources.push(incoming.source)
  }

  if (!existing.title && incoming.title) {
    existing.title = incoming.title
  }
  if (!existing.originalTitle && incoming.originalTitle) {
    existing.originalTitle = incoming.originalTitle
  }
  if (existing.year === undefined && incoming.year !== undefined) {
    existing.year = incoming.year
  }
  if (existing.runtimeMinutes === undefined && incoming.runtimeMinutes !== undefined) {
    existing.runtimeMinutes = incoming.runtimeMinutes
  }
  if (!existing.titleType && incoming.titleType) {
    existing.titleType = incoming.titleType
  }
  if (!existing.overview && incoming.overview) {
    existing.overview = incoming.overview
  }
  if (!existing.language && incoming.language) {
    existing.language = incoming.language
  }

  for (const alt of incoming.altTitles) {
    if (alt && alt !== existing.title && !existing.altTitles.includes(alt)) {
      existing.altTitles.push(alt)
    }
  }
  if (
    incoming.title &&
    incoming.title !== existing.title &&
    !existing.altTitles.includes(incoming.title)
  ) {
    existing.altTitles.push(incoming.title)
  }

  for (const dir of incoming.directors) {
    if (dir && !existing.directors.includes(dir)) {
      existing.directors.push(dir)
    }
  }
  for (const actor of incoming.cast) {
    if (actor && !existing.cast.includes(actor)) {
      existing.cast.push(actor)
    }
  }
}

function parseOmdbRuntime(runtime?: string): number | undefined {
  if (!runtime || runtime === 'N/A') return undefined
  const match = runtime.match(/(\d+)/)
  if (!match?.[1]) return undefined
  const mins = parseInt(match[1], 10)
  return Number.isNaN(mins) ? undefined : mins
}

function splitCsv(value?: string): string[] {
  if (!value || value === 'N/A') return []
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

/**
 * Retrieve and deduplicate movie candidates across tiered sources
 */
export async function retrieveCandidates(
  input: CandidateQueryInput,
  options: RetrievalOptions = {}
): Promise<RetrievedCandidate[]> {
  const limit = options.limit ?? 15
  const omdbApiKey = options.omdbApiKey || process.env.OMDB_API_KEY
  const candidates = new Map<string, RetrievedCandidate>()

  const searchQueries = Array.from(
    new Set(
      [input.title, input.originalTitle, ...(input.altTitles || [])]
        .map(q => q?.trim())
        .filter((q): q is string => Boolean(q && q.length > 0))
    )
  ).slice(0, 3)

  // Tier 1: Direct tt* regex in description (or title)
  const directId = extractImdbIdFromText(input.description) || extractImdbIdFromText(input.title)
  if (directId) {
    const localMatch = isImdbLocalIndexAvailable() ? getImdbLocalById(directId) : null
    if (localMatch) {
      mergeCandidate(candidates, {
        imdbId: localMatch.imdbId,
        title: localMatch.title,
        originalTitle: localMatch.originalTitle,
        altTitles: localMatch.altTitles,
        year: localMatch.year,
        runtimeMinutes: localMatch.runtimeMinutes,
        titleType: localMatch.titleType,
        directors: localMatch.directors,
        cast: localMatch.cast,
        source: 'description_regex',
      })
    } else if (!options.skipExternalApis && omdbApiKey) {
      try {
        const omdbMeta = await getMovieByImdbId(directId, omdbApiKey)
        if (omdbMeta?.Title) {
          mergeCandidate(candidates, {
            imdbId: (omdbMeta.imdbID || directId).toLowerCase(),
            title: omdbMeta.Title,
            altTitles: [],
            year: omdbMeta.Year ? parseInt(omdbMeta.Year, 10) || undefined : undefined,
            runtimeMinutes: parseOmdbRuntime(omdbMeta.Runtime),
            titleType: omdbMeta.Type,
            directors: splitCsv(omdbMeta.Director),
            cast: splitCsv(omdbMeta.Actors),
            overview: omdbMeta.Plot && omdbMeta.Plot !== 'N/A' ? omdbMeta.Plot : undefined,
            language:
              omdbMeta.Language && omdbMeta.Language !== 'N/A' ? omdbMeta.Language : undefined,
            source: 'description_regex',
          })
        }
      } catch (error) {
        console.warn(`[CandidateRetriever] OMDb lookup failed for ${directId}:`, error)
      }
    } else {
      mergeCandidate(candidates, {
        imdbId: directId,
        title: input.title,
        altTitles: [],
        year: input.year,
        directors: [],
        cast: [],
        source: 'description_regex',
      })
    }
  }

  // Tier 2: Local IMDb SQLite index
  if (isImdbLocalIndexAvailable()) {
    for (const q of searchQueries) {
      const localHits = searchImdbLocalIndex(q, input.year, 8)
      for (const hit of localHits) {
        mergeCandidate(candidates, {
          imdbId: hit.imdbId,
          title: hit.title,
          originalTitle: hit.originalTitle,
          altTitles: hit.altTitles,
          year: hit.year,
          runtimeMinutes: hit.runtimeMinutes,
          titleType: hit.titleType,
          directors: hit.directors,
          cast: hit.cast,
          source: 'imdb_local',
        })
      }
    }
  }

  if (options.skipExternalApis) {
    return Array.from(candidates.values()).slice(0, limit)
  }

  // Tier 3: TMDB API
  if (isTmdbAvailable()) {
    for (const q of searchQueries.slice(0, 2)) {
      try {
        const tmdbHits = await searchTmdbCandidates(q, input.year, 5)
        for (const hit of tmdbHits) {
          if (!hit.imdbId) continue
          mergeCandidate(candidates, {
            imdbId: hit.imdbId,
            title: hit.title,
            originalTitle: hit.originalTitle,
            altTitles: hit.altTitles,
            year: hit.year,
            runtimeMinutes: hit.runtime,
            titleType: 'movie',
            directors: hit.directors,
            cast: hit.cast,
            overview: hit.overview,
            language: hit.language,
            source: 'tmdb',
          })
        }
      } catch (error) {
        console.warn(`[CandidateRetriever] TMDB search failed for "${q}":`, error)
      }
    }
  }

  // Tier 4: IMDb Suggestion API
  for (const q of searchQueries.slice(0, 2)) {
    try {
      const suggestions = await searchImdbSuggestions(q, 8)
      for (const hit of suggestions) {
        mergeCandidate(candidates, {
          imdbId: hit.imdbId,
          title: hit.title,
          altTitles: [],
          year: hit.year,
          titleType: hit.type,
          directors: [],
          cast: hit.cast,
          source: 'imdb_suggestion',
        })
      }
    } catch (error) {
      console.warn(`[CandidateRetriever] IMDb Suggestion failed for "${q}":`, error)
    }
  }

  // Tier 5: Wikidata API
  for (const q of searchQueries.slice(0, 2)) {
    try {
      const wikiHits = await searchWikidataImdb(q, input.language || 'en', 8)
      for (const hit of wikiHits) {
        mergeCandidate(candidates, {
          imdbId: hit.imdbId,
          title: hit.title,
          altTitles: hit.altTitles,
          year: hit.year,
          directors: [],
          cast: [],
          overview: hit.description,
          source: 'wikidata',
        })
      }
    } catch (error) {
      console.warn(`[CandidateRetriever] Wikidata search failed for "${q}":`, error)
    }
  }

  // Tier 6: OMDb search
  if (omdbApiKey && searchQueries[0]) {
    try {
      let omdbRes = await searchOMDB(searchQueries[0], input.year, omdbApiKey)
      if ((!omdbRes.Search || omdbRes.Search.length === 0) && input.year) {
        omdbRes = await searchOMDB(searchQueries[0], undefined, omdbApiKey)
      }
      for (const hit of omdbRes.Search || []) {
        if (!hit.imdbID || !/^tt\d+$/i.test(hit.imdbID)) continue
        const parsedYear = hit.Year ? parseInt(hit.Year, 10) : NaN
        mergeCandidate(candidates, {
          imdbId: hit.imdbID.toLowerCase(),
          title: hit.Title,
          altTitles: [],
          year: !Number.isNaN(parsedYear) ? parsedYear : undefined,
          titleType: hit.Type,
          directors: [],
          cast: [],
          source: 'omdb',
        })
      }
    } catch (error) {
      console.warn(`[CandidateRetriever] OMDb search failed for "${searchQueries[0]}":`, error)
    }
  }

  // Tier 7: Free DuckDuckGo HTML search fallback (when no candidates found yet)
  if (options.allowDuckDuckGoFallback !== false && candidates.size === 0 && searchQueries[0]) {
    try {
      const ddgHits = await searchDuckDuckGoForImdb(searchQueries[0], input.year)
      for (const hit of ddgHits) {
        mergeCandidate(candidates, {
          imdbId: hit.imdbId,
          title: hit.title,
          altTitles: [],
          year: hit.year,
          directors: [],
          cast: [],
          overview: hit.snippet,
          source: 'duckduckgo',
        })
      }
    } catch (error) {
      console.warn('[CandidateRetriever] DuckDuckGo fallback failed:', error)
    }
  }

  // Tier 8: Optional Google CSE tail fallback (strictly under 100/day cap)
  if (options.allowGoogleFallback && candidates.size === 0 && searchQueries[0]) {
    const quota = getGoogleQuotaStatus()
    if (!quota.exhausted) {
      try {
        const queryParts = [`site:imdb.com/title`, `"${searchQueries[0]}"`]
        if (input.year) {
          queryParts.push(String(input.year))
        }
        const googleRes = await searchGoogleForImdb(queryParts.join(' '), {
          enforceDailyCap: true,
        })
        for (const hit of googleRes.Search || []) {
          const parsedYear = hit.Year && hit.Year !== 'N/A' ? parseInt(hit.Year, 10) : NaN
          mergeCandidate(candidates, {
            imdbId: hit.imdbID.toLowerCase(),
            title: hit.Title,
            altTitles: [],
            year: !Number.isNaN(parsedYear) ? parsedYear : undefined,
            titleType: hit.Type,
            directors: [],
            cast: [],
            overview: hit.Snippet || undefined,
            source: 'google_cse',
          })
        }
      } catch (error) {
        console.warn('[CandidateRetriever] Google CSE fallback failed:', error)
      }
    }
  }

  return Array.from(candidates.values()).slice(0, limit)
}
