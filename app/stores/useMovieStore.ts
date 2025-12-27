import type { MovieEntry, MovieSource, MovieSourceType, MovieMetadata } from '~/types'

// Frontend-specific loading state type
export interface LoadingState {
  movies: boolean
  movieDetails: boolean
  imdbFetch: boolean
}

export const useMovieStore = defineStore('movie', () => {
  // State
  const movies = ref<MovieEntry[]>([])
  const movieDetailsCache = ref<Map<string, MovieEntry>>(new Map())
  const isLoading = ref<LoadingState>({
    movies: false,
    movieDetails: false,
    imdbFetch: false,
  })
  const isInitialLoading = ref(true)

  // Database composable
  const db = useDatabase()

  // Cached poster existence checks
  const posterCache = ref<Map<string, boolean>>(new Map())

  /**
   * Map SQL row to MovieEntry
   */
  const mapRowToMovie = (row: any): MovieEntry => {
    const sourcesRaw = row.sources_raw || ''
    const sources: MovieSource[] = sourcesRaw
      ? sourcesRaw
          .split('###')
          .filter((s: string) => s.trim())
          .map((s: string) => {
            const [type, id, label, quality, addedAt, description, channelName] = s.split('|')
            if (!type || !id) return null

            const base = {
              type: type as MovieSourceType,
              url: generateSourceUrl(type as any, id),
              id,
              label: label || undefined,
              quality: quality || undefined,
              addedAt: addedAt || new Date().toISOString(),
              description: description || undefined,
            }

            if (type === 'youtube') {
              return {
                ...base,
                channelName: channelName || '',
              } as any
            }
            return base as any
          })
          .filter((s: any) => s !== null)
      : []

    const metadata: MovieMetadata | undefined = row.is_curated
      ? {
          Rated: row.rated,
          Runtime: row.runtime,
          Genre: row.genre,
          Director: row.director,
          Writer: row.writer,
          Actors: row.actors,
          Plot: row.plot,
          Language: row.language,
          Country: row.country,
          Awards: row.awards,
          imdbRating: row.imdbRating?.toString(),
          imdbVotes: row.imdbVotes?.toLocaleString(),
          imdbID: row.imdbId,
        }
      : undefined

    return {
      imdbId: row.imdbId,
      title: row.title,
      year: row.year,
      verified: !!row.verified,
      lastUpdated: row.lastUpdated,
      sources,
      metadata,
    }
  }

  /**
   * Load movies from SQLite database (initialization only)
   */
  const loadFromFile = async () => {
    isLoading.value.movies = true

    try {
      // Initialize database from remote file
      await db.init('/data/movies.db')

      // We don't load all movies anymore, just initialize
      isInitialLoading.value = false
    } catch (err) {
      console.error('Failed to initialize SQLite:', err)
      // Fallback to JSON API if SQLite fails
      await loadFromJson()
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Fetch movies with filtering and pagination
   */
  const fetchMovies = async (options: {
    where?: string
    params?: any[]
    orderBy?: string
    limit?: number
    offset?: number
    includeCount?: boolean
    searchQuery?: string
  }) => {
    if (!db.isReady.value) return { result: [], totalCount: 0 }

    const { searchQuery, where, params = [], orderBy, limit, offset, includeCount } = options

    let from = 'movies m'
    let finalWhere = where || ''

    if (searchQuery?.trim()) {
      from = 'fts_movies f JOIN movies m ON f.imdbId = m.imdbId'
      const searchWhere = 'fts_movies MATCH ?'
      finalWhere = finalWhere ? `(${finalWhere}) AND (${searchWhere})` : searchWhere
      params.push(searchQuery)
    }

    const { result, totalCount } = await db.extendedQuery({
      select: `m.*, GROUP_CONCAT(s.type || '|' || COALESCE(s.identifier, '') || '|' || COALESCE(s.label, '') || '|' || COALESCE(s.quality, '') || '|' || s.addedAt || '|' || COALESCE(s.description, '') || '|' || COALESCE(c.name, ''), '###') as sources_raw`,
      from: `${from} LEFT JOIN sources s ON m.imdbId = s.movieId LEFT JOIN channels c ON s.channelId = c.id`,
      where: finalWhere,
      params,
      groupBy: 'm.imdbId',
      orderBy: orderBy ? `${orderBy}, m.imdbId` : 'm.imdbId',
      limit,
      offset,
      includeCount,
    })

    return {
      result: result.map(mapRowToMovie),
      totalCount,
    }
  }

  /**
   * Fetch full movie details for specific IDs (with caching)
   */
  const fetchMoviesByIds = async (imdbIds: string[]): Promise<MovieEntry[]> => {
    if (!db.isReady.value) return []
    if (!imdbIds || imdbIds.length === 0) return []

    // Ensure cache is initialized
    if (!movieDetailsCache.value) {
      movieDetailsCache.value = new Map()
    }

    // Filter out IDs that are already cached
    const uncachedIds = imdbIds.filter(id => !movieDetailsCache.value.has(id))

    if (uncachedIds.length === 0) {
      // All movies are cached, return from cache
      return imdbIds.map(id => movieDetailsCache.value.get(id)!).filter(Boolean)
    }

    console.log('[MovieStore] Fetching details for', uncachedIds.length, 'uncached movies')

    try {
      const results = await db.queryByIds(uncachedIds)
      const movies = results.map(mapRowToMovie)

      // Cache the results
      movies.forEach(movie => {
        movieDetailsCache.value.set(movie.imdbId, movie)
      })

      // Return all requested movies (cached + newly fetched)
      return imdbIds.map(id => movieDetailsCache.value.get(id)!).filter(Boolean)
    } catch (err) {
      console.error('[MovieStore] Failed to fetch movies by IDs:', err)
      return []
    }
  }

  /**
   * Get a single movie from cache or fetch it
   */
  const getMovieDetails = async (imdbId: string): Promise<MovieEntry | undefined> => {
    // Check cache first
    if (movieDetailsCache.value.has(imdbId)) {
      return movieDetailsCache.value.get(imdbId)
    }

    // Fetch from database
    const movies = await fetchMoviesByIds([imdbId])
    return movies[0]
  }

  /**
   * Get related movies for a given movie ID
   * Returns full MovieEntry objects by querying the database
   */
  const getRelatedMovies = async (movieId: string, limit: number = 8): Promise<MovieEntry[]> => {
    try {
      // Fetch related movie IDs and basic info from database
      const relatedRows = await db.getRelatedMovies(movieId, limit)

      if (!relatedRows || relatedRows.length === 0) {
        return []
      }

      // Fetch full movie data for each related movie
      const relatedMovieIds = relatedRows.map(row => row.imdbId)
      const fullMovies = await db.queryByIds(relatedMovieIds)

      // Map to MovieEntry objects
      const movies = fullMovies.map(mapRowToMovie)

      // Sort by original score order (preserve database ordering)
      const scoreMap = new Map(relatedRows.map(row => [row.imdbId, row.score]))
      movies.sort((a, b) => {
        const scoreA = scoreMap.get(a.imdbId) || 0
        const scoreB = scoreMap.get(b.imdbId) || 0
        return scoreB - scoreA
      })

      return movies
    } catch (err) {
      console.error('[MovieStore] Failed to fetch related movies:', err)
      return []
    }
  }

  /**
   * Fallback: Load movies from JSON API
   */
  const loadFromJson = async () => {
    try {
      const response = await $fetch<Record<string, unknown>>('/api/movies')

      if (response.error) {
        console.error('Failed to load movies from JSON:', response.message)
        return
      }

      const movieEntries: MovieEntry[] = Object.entries(response)
        .filter(([key]) => !key.startsWith('_'))
        .filter(([, value]) => {
          if (!value || typeof value !== 'object' || !('imdbId' in value) || !('title' in value)) {
            return false
          }
          const movie = value as any
          if (typeof movie.imdbId !== 'string') return false
          if (typeof movie.title === 'string') return true
          if (Array.isArray(movie.title)) {
            return movie.title.every((t: any) => typeof t === 'string')
          }
          return false
        })
        .map(([, value]) => value as MovieEntry)
        .sort((a, b) => (a.imdbId || '').localeCompare(b.imdbId || ''))

      movies.value = movieEntries
    } catch (err) {
      console.error('Failed to load movies from JSON fallback:', err)
    }
  }

  /**
   * Load movies from JSON API (for Admin interface)
   */
  const loadFromApi = async () => {
    isLoading.value.movies = true
    try {
      await loadFromJson()
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Filter movies by source type
   * @param sourceType - Type of source to filter by ('archive.org' or 'youtube')
   * @returns Filtered array of movies
   */
  const filterBySource = (sourceType: MovieSourceType): MovieEntry[] => {
    return movies.value.filter((movie: MovieEntry) =>
      movie.sources.some((source: MovieSource) => source.type === sourceType)
    )
  }

  /**
   * Search movies by title, actors, director, or plot using SQLite FTS5
   * @param query - Search query string
   * @returns Filtered array of movies matching the query
   */
  const searchMovies = async (searchQuery: string): Promise<MovieEntry[]> => {
    if (!searchQuery || !searchQuery.trim()) return movies.value

    if (!db.isReady.value) {
      // Fallback to simple JS search if DB is not ready
      const lowerQuery = searchQuery.toLowerCase()
      return movies.value.filter((movie: MovieEntry) => {
        const titles = Array.isArray(movie.title) ? movie.title : [movie.title]
        return titles.some(t => t.toLowerCase().includes(lowerQuery))
      })
    }

    try {
      const results = await db.query(
        `
        SELECT m.imdbId
        FROM fts_movies f
        JOIN movies m ON f.imdbId = m.imdbId
        WHERE fts_movies MATCH ?
        ORDER BY rank
      `,
        [searchQuery]
      )

      const matchedIds = new Set(results.map((r: any) => r.imdbId))
      return movies.value.filter(m => matchedIds.has(m.imdbId))
    } catch (err) {
      console.error('FTS5 search failed:', err)
      return movies.value
    }
  }

  /**
   * Get a single movie by imdbId
   * @param imdbId - IMDB ID or temporary ID
   * @returns Movie entry or undefined
   */
  const getMovieById = async (imdbId: string): Promise<MovieEntry | undefined> => {
    // Check local state first
    const existing = movies.value.find((movie: MovieEntry) => movie.imdbId === imdbId)
    if (existing) return existing

    if (db.isReady.value) {
      try {
        const results = await db.query(
          `
          SELECT m.*, GROUP_CONCAT(s.type || '|' || COALESCE(s.identifier, '') || '|' || COALESCE(s.label, '') || '|' || COALESCE(s.quality, '') || '|' || s.addedAt || '|' || COALESCE(s.description, '') || '|' || COALESCE(c.name, ''), '###') as sources_raw
          FROM movies m
          LEFT JOIN sources s ON m.imdbId = s.movieId
          LEFT JOIN channels c ON s.channelId = c.id
          WHERE m.imdbId = ?
          GROUP BY m.imdbId
        `,
          [imdbId]
        )

        if (results.length > 0) {
          return mapRowToMovie(results[0])
        }
      } catch (err) {
        console.error('SQL getMovieById failed:', err)
      }
    }

    // Fallback to JSON API for single movie
    try {
      const movie = await $fetch<MovieEntry>(`/api/movie/${imdbId}`)
      return movie
    } catch {
      return undefined
    }
  }

  /**
   * Get movies that have OMDB metadata
   * @returns Array of movies with metadata
   */
  const getEnrichedMovies = (): MovieEntry[] => {
    return movies.value.filter((movie: MovieEntry) => movie.metadata !== undefined)
  }

  /**
   * Get movies without OMDB metadata (need enrichment)
   * @returns Array of movies without metadata
   */
  const getUnenrichedMovies = (): MovieEntry[] => {
    return movies.value.filter((movie: MovieEntry) => movie.metadata === undefined)
  }

  /**
   * Check if a local poster exists for the given imdbId
   * Uses cache to avoid repeated network requests
   * @param imdbId - IMDB ID to check
   * @returns Promise<boolean> indicating whether the poster exists locally
   */
  const posterExists = async (imdbId: string): Promise<boolean> => {
    if (!imdbId) return false

    // Check cache first
    if (posterCache.value.has(imdbId)) {
      return posterCache.value.get(imdbId)!
    }

    try {
      // Try to fetch the local poster with HEAD request to avoid downloading
      const response = await fetch(`/posters/${imdbId}.jpg`, { method: 'HEAD' })
      const exists = response.ok
      posterCache.value.set(imdbId, exists)
      return exists
    } catch {
      posterCache.value.set(imdbId, false)
      return false
    }
  }

  /**
   * Get the best available poster URL with fallback logic
   * Priority: local cache -> OMDB URL -> placeholder
   * @param movie - Movie entry
   * @returns Promise<string> - URL to the poster image
   */
  const getPosterUrl = async (movie: MovieEntry): Promise<string> => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    // Check for local poster first (best performance)
    const hasLocal = await posterExists(movie.imdbId)
    if (hasLocal) {
      return `/posters/${movie.imdbId}.jpg`
    }

    // Fallback to OMDB poster URL if available
    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    // Final fallback to placeholder
    return placeholder
  }

  /**
   * Get poster URL synchronously (for SSR or when you know the status)
   * This version doesn't check if the local file exists - assumes you've already checked
   * @param movie - Movie entry
   * @param preferLocal - Whether to prefer local path (default: true)
   * @returns string - URL to the poster image
   */
  const getPosterUrlSync = (movie: MovieEntry, preferLocal: boolean = true): string => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    // If preferLocal, return local path (browser will handle 404 gracefully)
    if (preferLocal) {
      return `/posters/${movie.imdbId}.jpg`
    }

    // Otherwise use OMDB poster URL
    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    return placeholder
  }

  /**
   * Preload posters for multiple movies (batch check)
   * @param imdbIds - Array of IMDB IDs to check
   * @returns Promise<Map<string, boolean>> - Map of imdbId to existence status
   */
  const preloadPosters = async (imdbIds: string[]): Promise<Map<string, boolean>> => {
    const results = new Map<string, boolean>()

    // Check all posters in parallel (but limit concurrency to avoid overwhelming the server)
    const batchSize = 10
    for (let i = 0; i < imdbIds.length; i += batchSize) {
      const batch = imdbIds.slice(i, i + batchSize)
      const promises = batch.map(async imdbId => {
        const exists = await posterExists(imdbId)
        results.set(imdbId, exists)
      })
      await Promise.all(promises)
    }

    return results
  }

  /**
   * Get all sources for a movie grouped by type
   * @param movie - Movie entry
   * @returns Object with sources grouped by type
   */
  const getSourcesByType = (movie: MovieEntry): Record<MovieSourceType, MovieSource[]> => {
    return movie.sources.reduce(
      (grouped: Record<MovieSourceType, MovieSource[]>, source: MovieSource) => {
        grouped[source.type].push(source)
        return grouped
      },
      {
        'archive.org': [],
        youtube: [],
      } as Record<MovieSourceType, MovieSource[]>
    )
  }

  /**
   * Get the primary source for a movie (first source, or highest quality)
   * @param movie - Movie entry
   * @returns Primary movie source
   */
  const getPrimarySource = (movie: MovieEntry): MovieSource | undefined => {
    if (movie.sources.length === 0) return undefined

    // Prefer archive.org sources (usually higher quality)
    const archiveSources = movie.sources.filter((s: MovieSource) => s.type === 'archive.org')
    if (archiveSources.length > 0) {
      // Sort by downloads if available
      const sorted = [...archiveSources].sort((a: MovieSource, b: MovieSource) => {
        const aDownloads = 'downloads' in a ? a.downloads || 0 : 0
        const bDownloads = 'downloads' in b ? b.downloads || 0 : 0
        return bDownloads - aDownloads
      })
      return sorted[0]
    }

    // Otherwise return first YouTube source
    return movie.sources[0]
  }

  /**
   * Runtime OMDB enrichment (optional, for movies without metadata)
   * This can be used to fetch metadata on-demand for movies that don't have it yet
   * @param movie - Movie entry to enrich
   * @returns Updated movie metadata or null if failed
   */
  const enrichMovieMetadata = async (movie: MovieEntry) => {
    isLoading.value.imdbFetch = true

    const apiKey = useRuntimeConfig().public.OMDB_API_KEY
    if (!apiKey) {
      isLoading.value.imdbFetch = false
      return null
    }

    try {
      // Only enrich if we have a valid IMDB ID (not temporary)
      if (!movie.imdbId.startsWith('tt')) {
        isLoading.value.imdbFetch = false
        return null
      }

      const metadata = await $fetch<MovieMetadata>('https://www.omdbapi.com/', {
        params: {
          apikey: apiKey,
          i: movie.imdbId,
          plot: 'full',
        },
      })

      if (metadata && 'Error' in metadata) {
        isLoading.value.imdbFetch = false
        return null
      }

      // Update the movie in our local state
      const movieIndex = movies.value.findIndex((m: MovieEntry) => m.imdbId === movie.imdbId)
      if (movieIndex !== -1 && movies.value[movieIndex]) {
        movies.value[movieIndex]!.metadata = metadata
      }

      isLoading.value.imdbFetch = false
      return metadata
    } catch {
      isLoading.value.imdbFetch = false
      return null
    }
  }

  return {
    // State
    movies,
    movieDetailsCache,
    isLoading,
    isInitialLoading,

    // Data loading
    loadFromFile,
    loadFromApi,
    fetchMovies,
    fetchMoviesByIds,
    getMovieDetails,
    getRelatedMovies,
    mapRowToMovie,

    // Filtering & search
    filterBySource,
    searchMovies,
    getMovieById,
    getEnrichedMovies,
    getUnenrichedMovies,

    // Source utilities
    getSourcesByType,
    getPrimarySource,

    // Poster utilities
    posterExists,
    getPosterUrl,
    getPosterUrlSync,
    preloadPosters,

    // Runtime enrichment (optional)
    enrichMovieMetadata,
  }
})
