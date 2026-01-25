import type { MovieEntry, MovieSourceType, LightweightMovie, SortOption } from '~/types'
import type { FilterOptionsResponse } from '~/types/database'
import { useStorage, watchDebounced } from '@vueuse/core'

/**
 * Movie Store
 * Manages movie data, filtering, sorting, and user interactions
 * Uses SQLite WASM for efficient querying and VueUse for persistent storage
 */

/**
 * Frontend-specific loading state type
 */
export interface LoadingState {
  movies: boolean
  movieDetails: boolean
  imdbFetch: boolean
}

/**
 * Available sort options for movies
 */
const SORT_OPTIONS: SortOption[] = [
  { field: 'relevance', direction: 'desc', label: 'Relevance' },
  { field: 'year', direction: 'desc', label: 'Year (Newest)' },
  { field: 'year', direction: 'asc', label: 'Year (Oldest)' },
  { field: 'rating', direction: 'desc', label: 'Rating (High)' },
  { field: 'rating', direction: 'asc', label: 'Rating (Low)' },
  { field: 'title', direction: 'asc', label: 'Title (A-Z)' },
  { field: 'title', direction: 'desc', label: 'Title (Z-A)' },
  { field: 'votes', direction: 'desc', label: 'Most Popular' },
]

/**
 * Default filter state
 */
const DEFAULT_FILTERS: FilterState = {
  sort: { field: 'year', direction: 'desc' }, // Year (Newest)
  sources: [],
  minRating: 0,
  minYear: 0,
  maxYear: 0,
  minVotes: 0,
  maxVotes: 0,
  genres: [],
  countries: [],
  searchQuery: '',
  searchMode: 'exact',
}

/**
 * Unified Movie Store
 *
 * Consolidates useMovieStore, useFilterStore, useLikedMoviesStore, and useWatchlistStore
 * into a single source of truth with computed views for filtered/liked/watchlist movies.
 *
 * Key Features:
 * - Single Map<string, MovieEntry> for all movies (O(1) lookups)
 * - Computed properties for filtered views (no duplicate arrays)
 * - Embedded like/watchlist metadata in movie objects
 * - Reactive filters with automatic recomputation
 * - localStorage persistence for user data and filters
 */
export const useMovieStore = defineStore('movie', () => {
  // ============================================
  // STATE
  // ============================================

  // Removed allMovies - only use lightweightMovieCache for caching
  // Full MovieEntry objects are loaded on-demand for single movie pages

  // Cache for lightweight movies (for grid display)
  // Use shallowRef to avoid deep reactivity on movie objects (performance optimization)
  const lightweightMovieCache = shallowRef<Map<string, LightweightMovie>>(new Map())

  // Cache for similar movies (vector search results)
  const similarMoviesCache = shallowRef<Map<string, LightweightMovie[]>>(new Map())

  // Liked movie IDs stored in localStorage using VueUse
  const likedMovieIds = useStorage<string[]>('movies-deluxe-liked', [])

  // Filter state stored in localStorage using VueUse
  const filters = useStorage<FilterState>('movies-deluxe-filters', DEFAULT_FILTERS)

  // Migration for searchMode
  onMounted(() => {
    const currentMode = filters.value.searchMode as string
    if (currentMode === 'keyword') {
      filters.value.searchMode = 'exact'
    } else if (currentMode === 'hybrid') {
      filters.value.searchMode = 'semantic'
    }
  })

  const isFiltering = ref(false)

  // Database composable
  const db = useDatabase()

  // Expose embeddings state from database composable
  const isEmbeddingsLoaded = computed(() => db.isEmbeddingsLoaded.value)
  const isEmbeddingsLoading = computed(() => db.isEmbeddingsLoading.value)
  const currentEmbeddingsModelId = computed(() => db.currentEmbeddingsModelId.value)

  // Track IDs currently being fetched to avoid duplicate requests
  const pendingIds = new Set<string>()

  // Track the latest request ID for filter/search queries to discard stale results
  const currentSearchSessionId = ref(0)

  // Simple cache for filter options
  let cachedFilterOptions: FilterOptionsResponse | null = null

  // ============================================
  // COMPUTED PROPERTIES - Data Views
  // ============================================

  /**
   * Search result movie IDs (in order)
   * Contains the IDs of movies that match current search/filter criteria
   */
  const searchResultMovies = ref<string[]>([])

  // ============================================
  // COMPUTED PROPERTIES - Statistics
  // ============================================

  /**
   * Total number of movies in the database (set once during initialization)
   */
  const totalMovies = ref(0)

  /**
   * Number of movies after applying filters
   */
  const totalFiltered = ref(0)

  /**
   * Number of liked movies - calculated directly from likedMovieIds
   */
  const likedCount = computed((): number => likedMovieIds.value.length)

  /**
   * Number of active filters (excluding sort)
   */
  const activeFiltersCount = computed((): number => {
    let count = 0
    if (filters.value.sources.length > 0) count++
    if (filters.value.minRating > 0) count++
    if (filters.value.minYear > 0) count++
    if (filters.value.minVotes > 0) count++
    if (filters.value.genres.length > 0) count++
    if (filters.value.countries.length > 0) count++
    return count
  })

  /**
   * Whether any filters are active
   */
  const hasActiveFilters = computed((): boolean => {
    return (
      filters.value.sources.length > 0 ||
      filters.value.minRating > 0 ||
      filters.value.minYear > 0 ||
      filters.value.minVotes > 0 ||
      filters.value.genres.length > 0 ||
      filters.value.countries.length > 0
    )
  })

  /**
   * Current sort option (reconstructed from stored state)
   */
  const currentSortOption = computed((): SortOption => {
    if (!filters.value || !filters.value.sort) {
      return SORT_OPTIONS[0]!
    }

    const stored = filters.value.sort
    const found = SORT_OPTIONS.find(
      opt => opt.field === stored.field && opt.direction === stored.direction
    )
    return found || SORT_OPTIONS[0]!
  })

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Map MovieEntry to LightweightMovie
   */
  const mapMovieToLightweight = (movie: {
    readonly movieId: string
    readonly title: string
    readonly year?: number
    readonly metadata?: {
      readonly imdbRating?: number
      readonly imdbVotes?: number
      readonly Language?: string
      readonly Genre?: string
      readonly Country?: string
    }
    readonly sources?: readonly {
      readonly type: MovieSourceType
      readonly language?: string | readonly string[]
      readonly channelName?: string
    }[]
    readonly verified?: boolean
  }): LightweightMovie => {
    return {
      movieId: movie.movieId,
      title: movie.title,
      year: movie.year,
      imdbRating: movie.metadata?.imdbRating,
      imdbVotes: movie.metadata?.imdbVotes,
      language:
        movie.metadata?.Language ||
        (Array.isArray(movie.sources?.[0]?.language)
          ? movie.sources?.[0]?.language[0]
          : (movie.sources?.[0]?.language as string)),
      sourceType: movie.sources?.[0]?.type,
      channelName: movie.sources?.[0]?.channelName,
      verified: movie.verified,
      genre: movie.metadata?.Genre,
      country: movie.metadata?.Country,
    }
  }

  // ============================================
  // DATA LOADING ACTIONS
  // ============================================

  /**
   * Load movies from the SQLite database file
   * Called once on app initialization
   * Note: Only loads the main movies.db - embeddings are loaded separately via loadEmbeddings()
   */
  const loadFromFile = async () => {
    console.log('[loadFromFile] Starting database initialization')

    try {
      // Initialize database from remote file and get total movie count
      // Pass baseURL for WASM file loading
      const baseURL = useRuntimeConfig().app.baseURL
      totalMovies.value = await db.init(`${baseURL}data/movies.db`, baseURL)
      console.log('[loadFromFile] Database initialized successfully')
      console.log('[loadFromFile] Total movies count:', totalMovies.value)

      isFiltering.value = false
    } catch (err) {
      console.error('[loadFromFile] Failed to initialize SQLite:', err)

      // Show toast notification for database initialization failure
      const { showToast } = useToastStore()
      showToast(
        'Failed to load movie database. Please refresh the page to try again.',
        'error',
        5000
      )
    } finally {
      console.log('[loadFromFile] Finished database initialization')
      isFiltering.value = false
    }
  }

  /**
   * Load embeddings for semantic search
   * Can be called after loadFromFile() to enable semantic search functionality
   * @param modelId - The embedding model ID (e.g., 'nomic', 'bge-micro', 'potion')
   */
  const loadEmbeddings = async (modelId: string): Promise<number> => {
    console.log('[loadEmbeddings] Loading embeddings for model:', modelId)
    try {
      const count = await db.attachEmbeddings(modelId)
      console.log('[loadEmbeddings] Embeddings loaded successfully, count:', count)
      return count
    } catch (err) {
      console.error('[loadEmbeddings] Failed to load embeddings:', err)

      // Show toast notification for embeddings loading failure
      const { showToast } = useToastStore()
      showToast('Failed to load embeddings for semantic search.', 'error', 5000)

      throw err
    }
  }

  /**
   * Fetch lightweight movie details for specific IDs (with caching)
   * Populates the lightweightMovieCache and does not return movies directly
   */
  const fetchMoviesByIds = async (movieIds: string[]): Promise<void> => {
    if (!movieIds || movieIds.length === 0) return

    // Filter out IDs that are already cached or pending
    const uncachedIds = movieIds.filter(
      id => !lightweightMovieCache.value.has(id) && !pendingIds.has(id)
    )

    if (uncachedIds.length === 0) {
      // All movies are either cached or already being fetched
      return
    }

    console.log('[fetchMoviesByIds] Fetching', uncachedIds.length, 'uncached movies from database')

    try {
      const lightweightMovies = await db.queryByIds(uncachedIds)
      console.log('[fetchMoviesByIds] Fetched', lightweightMovies.length, 'movies from database')

      // Cache the results directly in the lightweight cache (no conversion needed)
      lightweightMovies.forEach(movie => {
        lightweightMovieCache.value.set(movie.movieId, movie)
      })

      // Handle IDs that were not found in the database (e.g., temporary IDs or missing entries)
      const foundIds = new Set(lightweightMovies.map(m => m.movieId))
      const missingIds = uncachedIds.filter(id => !foundIds.has(id))

      if (missingIds.length > 0) {
        console.warn(
          '[fetchMoviesByIds]',
          missingIds.length,
          'movies not found in database:',
          missingIds
        )
      }

      // Trigger reactivity by replacing the Map instance
      lightweightMovieCache.value = new Map(lightweightMovieCache.value)
    } catch (err) {
      console.error('[fetchMoviesByIds] Failed to fetch movies by IDs:', err)
    } finally {
      // Remove from pending
      uncachedIds.forEach(id => pendingIds.delete(id))
    }
  }

  /**
   * Get a single movie by ID (loads from JSON file on demand)
   */
  const getMovieById = async (movieId: string): Promise<MovieEntry | undefined> => {
    console.log('[getMovieById] Getting movie:', movieId)

    // Fetch full details from JSON file (static deployment)
    console.log('[getMovieById] Fetching from JSON file')
    try {
      const movie = await $fetch<MovieEntry>(
        `${useRuntimeConfig().app.baseURL}movies/${movieId}.json`
      )
      // Validate that we got a proper movie object (not HTML or malformed data)
      if (movie && typeof movie === 'object' && movie.movieId && movie.title) {
        console.log('[getMovieById] Successfully fetched movie from JSON')
        return movie
      }
      // If we got invalid data, treat it as not found
      console.warn('[getMovieById] Invalid movie data received')
      return undefined
    } catch (err) {
      console.error(`[getMovieById] Failed to fetch movie details for ${movieId}:`, err)
      return undefined
    }
  }

  /**
   * Get filter options with simple caching
   */
  const getFilterOptions = async (): Promise<FilterOptionsResponse> => {
    // Return cached data if available
    if (cachedFilterOptions) {
      return cachedFilterOptions
    }

    // Fetch from database and cache
    console.log('[getFilterOptions] Fetching filter options from database')
    const data = await db.getFilterOptions()
    cachedFilterOptions = data

    console.log('[getFilterOptions] Cached filter options:', {
      genres: data.genres.length,
      countries: data.countries.length,
      channels: data.channels.length,
    })

    return data
  }

  // ============================================
  // FILTERING & SORTING ACTIONS
  // ============================================

  /**
   * Build unified SQL query for both search and filter scenarios
   */
  const buildFilterQuery = (searchQuery?: string) => {
    let sql: string
    const params: (string | number)[] = []
    const whereConditions: string[] = []
    const whereParams: (string | number)[] = []

    if (searchQuery?.trim()) {
      const parsed = parseSearchQuery(searchQuery)
      const hasKeywords = !!(
        parsed.actors?.length ||
        parsed.directors?.length ||
        parsed.writers?.length ||
        parsed.title
      )

      if (hasKeywords) {
        const joins: string[] = []
        const searchConditions: string[] = []

        if (parsed.title) {
          joins.push(`JOIN fts_movies ft ON m.movieId = ft.movieId`)
          searchConditions.push(`ft.title MATCH ?`)
          params.push(`"${parsed.title.replace(/"/g, '""')}"`)
        }

        if (parsed.actors) {
          parsed.actors.forEach((actor, i) => {
            const ma = `ma${i}`
            const fa = `fa${i}`
            joins.push(`JOIN movie_actors ${ma} ON m.movieId = ${ma}.movieId`)
            joins.push(`JOIN fts_actors ${fa} ON ${ma}.actorId = ${fa}.actorId`)
            searchConditions.push(`${fa}.name MATCH ?`)
            params.push(`"${actor.replace(/"/g, '""')}"`)
          })
        }

        if (parsed.directors) {
          parsed.directors.forEach((director, i) => {
            const md = `md${i}`
            const fd = `fd${i}`
            joins.push(`JOIN movie_directors ${md} ON m.movieId = ${md}.movieId`)
            joins.push(`JOIN fts_directors ${fd} ON ${md}.directorId = ${fd}.directorId`)
            searchConditions.push(`${fd}.name MATCH ?`)
            params.push(`"${director.replace(/"/g, '""')}"`)
          })
        }

        if (parsed.writers) {
          parsed.writers.forEach((writer, i) => {
            const mw = `mw${i}`
            const fw = `fw${i}`
            joins.push(`JOIN movie_writers ${mw} ON m.movieId = ${mw}.movieId`)
            joins.push(`JOIN fts_writers ${fw} ON ${mw}.writerId = ${fw}.writerId`)
            searchConditions.push(`${fw}.name MATCH ?`)
            params.push(`"${writer.replace(/"/g, '""')}"`)
          })
        }

        if (parsed.general) {
          joins.push(`JOIN fts_movies fg ON m.movieId = fg.movieId`)
          searchConditions.push(`fg.title MATCH ?`)
          params.push(`"${parsed.general.replace(/"/g, '""')}"`)
        }

        sql = `
          SELECT DISTINCT m.movieId
          FROM movies m
          ${joins.join(' ')}
          WHERE ${searchConditions.join(' AND ')}
        `
      } else if (parsed.general) {
        // General search across all fields using UNION for better performance and correctness
        const generalTerm = `"${parsed.general.replace(/"/g, '""')}"`
        sql = `
          SELECT m.movieId
          FROM movies m
          WHERE m.movieId IN (
            SELECT movieId FROM fts_movies WHERE title MATCH ?
            UNION
            SELECT ma.movieId FROM fts_actors fa JOIN movie_actors ma ON fa.actorId = ma.actorId WHERE name MATCH ?
            UNION
            SELECT md.movieId FROM fts_directors fd JOIN movie_directors md ON fd.directorId = md.directorId WHERE name MATCH ?
            UNION
            SELECT mw.movieId FROM fts_writers fw JOIN movie_writers mw ON fw.writerId = mw.writerId WHERE name MATCH ?
          )
        `
        params.push(generalTerm, generalTerm, generalTerm, generalTerm)
      } else {
        sql = `SELECT m.movieId FROM movies m WHERE 1=1`
      }
    } else {
      // No search query - query all movies
      sql = `
        SELECT m.movieId
        FROM movies m
        WHERE 1=1
      `
    }

    // Add common filter conditions
    if (filters.value.minRating > 0) {
      const cond = `m.imdbRating >= ?`
      whereConditions.push(cond)
      whereParams.push(filters.value.minRating)
      if (!searchQuery?.trim() || sql.includes('WHERE 1=1')) {
        sql += ` AND ${cond}`
        params.push(filters.value.minRating)
      } else {
        sql += ` AND ${cond}`
        params.push(filters.value.minRating)
      }
    }

    if (filters.value.minYear > 0) {
      const cond = `m.year >= ?`
      whereConditions.push(cond)
      whereParams.push(filters.value.minYear)
      sql += ` AND ${cond}`
      params.push(filters.value.minYear)
    }

    if (filters.value.maxYear && filters.value.maxYear > 0) {
      const cond = `m.year <= ?`
      whereConditions.push(cond)
      whereParams.push(filters.value.maxYear)
      sql += ` AND ${cond}`
      params.push(filters.value.maxYear)
    }

    if (filters.value.minVotes > 0) {
      const cond = `m.imdbVotes >= ?`
      whereConditions.push(cond)
      whereParams.push(filters.value.minVotes)
      sql += ` AND ${cond}`
      params.push(filters.value.minVotes)
    }

    if (filters.value.maxVotes && filters.value.maxVotes > 0) {
      const cond = `m.imdbVotes <= ?`
      whereConditions.push(cond)
      whereParams.push(filters.value.maxVotes)
      sql += ` AND ${cond}`
      params.push(filters.value.maxVotes)
    }

    // Add source filters
    if (filters.value.sources.length > 0) {
      const sourceConditions: string[] = []
      const sourceParams: (string | number)[] = []

      filters.value.sources.forEach(source => {
        if (source === 'archive.org') {
          sourceConditions.push('m.primarySourceType = ?')
          sourceParams.push('archive.org')
        } else {
          sourceConditions.push('(m.primarySourceType = ? AND m.primaryChannelName = ?)')
          sourceParams.push('youtube', source)
        }
      })

      if (sourceConditions.length > 0) {
        const cond = `(${sourceConditions.join(' OR ')})`
        whereConditions.push(cond)
        whereParams.push(...sourceParams)
        sql += ` AND ${cond}`
        params.push(...sourceParams)
      }
    }

    // Add genre filters
    if (filters.value.genres.length > 0) {
      const genreConditions = filters.value.genres.map(
        () => '(m.genre LIKE ? OR m.genre LIKE ? OR m.genre LIKE ? OR m.genre = ?)'
      )
      const genreParams: (string | number)[] = []

      filters.value.genres.forEach(genre => {
        genreParams.push(`${genre},%`, `%, ${genre},%`, `%, ${genre}`, genre)
      })

      const cond = `(${genreConditions.join(' OR ')})`
      whereConditions.push(cond)
      whereParams.push(...genreParams)
      sql += ` AND ${cond}`
      params.push(...genreParams)
    }

    // Add country filters
    if (filters.value.countries.length > 0) {
      const countryConditions = filters.value.countries.map(
        () => '(m.country LIKE ? OR m.country LIKE ? OR m.country LIKE ? OR m.country = ?)'
      )
      const countryParams: (string | number)[] = []

      filters.value.countries.forEach(country => {
        countryParams.push(`${country},%`, `%, ${country},%`, `%, ${country}`, country)
      })

      const cond = `(${countryConditions.join(' OR ')})`
      whereConditions.push(cond)
      whereParams.push(...countryParams)
      sql += ` AND ${cond}`
      params.push(...countryParams)
    }

    // Add sorting
    const sortOption =
      SORT_OPTIONS.find(
        opt =>
          opt.field === filters.value.sort.field && opt.direction === filters.value.sort.direction
      ) || SORT_OPTIONS[0]!

    if (!searchQuery?.trim() || sortOption.field !== 'relevance') {
      if (sortOption.field === 'year') {
        sql += ` ORDER BY m.year ${sortOption.direction === 'desc' ? 'DESC' : 'ASC'}`
      } else if (sortOption.field === 'rating') {
        sql += ` ORDER BY m.imdbRating ${sortOption.direction === 'desc' ? 'DESC' : 'ASC'}`
      } else if (sortOption.field === 'title') {
        sql += ` ORDER BY m.title ${sortOption.direction === 'desc' ? 'DESC' : 'ASC'}`
      } else if (sortOption.field === 'votes') {
        sql += ` ORDER BY m.imdbVotes ${sortOption.direction === 'desc' ? 'DESC' : 'ASC'}`
      } else {
        sql += ` ORDER BY m.year DESC`
      }
    } else if (searchQuery?.trim()) {
      sql += ` ORDER BY m.title ASC`
    }

    return {
      sql,
      params,
      where: whereConditions.length > 0 ? whereConditions.join(' AND ') : undefined,
      whereParams: whereConditions.length > 0 ? whereParams : undefined,
    }
  }

  /**
   * Execute unified filter query and return only movie IDs
   */
  const executeFilterQuery = async (sessionId: number): Promise<string[]> => {
    // Wait for database to be ready before querying
    if (!db.isReady.value) {
      console.log('[executeFilterQuery] Waiting for DB to be ready...')
      await db.waitForReady()
      console.log('[executeFilterQuery] DB is now ready')
    }

    const query = filters.value.searchQuery.trim()
    const vectorSearch = useVectorSearch()

    try {
      let results: string[] = []

      if (query && filters.value.searchMode === 'semantic') {
        const { where, whereParams } = buildFilterQuery()

        // Perform vector search with filters
        console.log('[executeFilterQuery] Performing vector search...')
        const vectorResults = await vectorSearch.search(query, 100, where, whereParams)
        results = vectorResults.map(r => r.movieId)
      } else {
        // Exact search or no query
        const { sql, params } = buildFilterQuery(query)
        console.log('[executeFilterQuery] Executing exact query with', params.length, 'parameters')
        const dbResults = await db.query(sql, params)
        results = dbResults.map(row => row.movieId as string)
      }

      // Check if this request is still current
      if (sessionId !== currentSearchSessionId.value) {
        console.log('[executeFilterQuery] Request cancelled, ignoring results')
        return []
      }

      console.log('[executeFilterQuery] Found', results.length, 'matches')
      return results
    } catch (err) {
      console.error('[executeFilterQuery] Query failed:', err)
      return []
    }
  }

  /**
   * Get similar movies for a given movie ID using vector search
   */
  const getSimilarMovies = async (
    movieId: string,
    limit: number = 10
  ): Promise<LightweightMovie[]> => {
    // Check cache first
    if (similarMoviesCache.value.has(movieId)) {
      return similarMoviesCache.value.get(movieId) || []
    }

    const vectorSearch = useVectorSearch()
    try {
      const results = await vectorSearch.findSimilar(movieId, limit)

      // Convert to lightweight movies and cache them
      const lightweightResults = results.map(r => {
        // Ensure movie is also in the general lightweight cache
        const lightweight = mapMovieToLightweight(r)
        if (!lightweightMovieCache.value.has(lightweight.movieId)) {
          lightweightMovieCache.value.set(lightweight.movieId, lightweight)
        }
        return lightweight
      })

      // Update both caches
      similarMoviesCache.value.set(movieId, lightweightResults)
      lightweightMovieCache.value = new Map(lightweightMovieCache.value)
      similarMoviesCache.value = new Map(similarMoviesCache.value)

      return lightweightResults
    } catch (err) {
      console.error('[getSimilarMovies] Failed to fetch similar movies:', err)
      return []
    }
  }

  /**
   * Clear all active filters and reset to defaults
   * @param keepSearch - Whether to keep the current search query
   */
  const clearAllFilters = (keepSearch = false) => {
    const currentSearch = filters.value.searchQuery
    const currentMode = filters.value.searchMode

    Object.assign(filters.value, DEFAULT_FILTERS)

    if (keepSearch) {
      filters.value.searchQuery = currentSearch
    }
    filters.value.searchMode = currentMode
  }

  // ============================================
  // LIKES ACTIONS
  // ============================================

  /**
   * Toggle like status for a movie
   */
  const toggleLike = (movieId: string) => {
    console.log('[toggleLike] Toggling like for:', movieId)
    const index = likedMovieIds.value.indexOf(movieId)
    if (index > -1) {
      // Remove from likes
      console.log('[toggleLike] Removing from likes')
      likedMovieIds.value.splice(index, 1)
    } else {
      // Add to likes
      console.log('[toggleLike] Adding to likes')
      likedMovieIds.value.push(movieId)
    }
  }

  // ============================================
  // WATCHERS
  // ============================================

  // Watch for filter changes and fetch (debounced to avoid rapid queries)
  watchDebounced(
    () => JSON.stringify(filters.value),
    async () => {
      console.log('[watchFilters] Filter change detected')

      // Only apply filters on the search page
      if (useRoute().path !== '/search') return

      // Increment session ID to cancel any pending requests from previous filter state
      currentSearchSessionId.value++
      const sessionId = currentSearchSessionId.value

      // Set filtering state
      isFiltering.value = true

      try {
        // Execute unified query to get movie IDs
        const filteredResults = await executeFilterQuery(sessionId)

        // Check if this request is still current (double-check after async operations)
        if (sessionId !== currentSearchSessionId.value) {
          console.log('[watchFilters] Request cancelled after execution, ignoring results')
          return
        }

        // Store the filtered movie IDs directly
        searchResultMovies.value = filteredResults
        totalFiltered.value = filteredResults.length

        console.log(
          '[watchFilters] Updated search results:',
          searchResultMovies.value.length,
          'movie IDs'
        )
      } catch (error) {
        console.error('[watchFilters] Failed to fetch filtered movies:', error)
        searchResultMovies.value = []
        totalFiltered.value = 0
      } finally {
        isFiltering.value = false
      }
    },
    { debounce: 300, maxWait: 1000 }
  )

  /**
   * Trigger search results update (for initial load on search page)
   */
  const triggerSearchUpdate = async () => {
    // Only trigger on search page
    if (useRoute().path !== '/search') return

    // Set filtering state
    isFiltering.value = true

    try {
      // Use the same unified query approach to get movie IDs
      const filteredResults = await executeFilterQuery(currentSearchSessionId.value)

      // Store the filtered movie IDs directly
      searchResultMovies.value = filteredResults
      totalFiltered.value = filteredResults.length

      console.log(
        '[triggerSearchUpdate] Updated search results:',
        searchResultMovies.value.length,
        'movie IDs'
      )
    } catch (error) {
      console.error('[triggerSearchUpdate] Failed to update search results:', error)
      searchResultMovies.value = []
      totalFiltered.value = 0
    } finally {
      isFiltering.value = false
    }
  }

  // ============================================
  // RETURN STORE API
  // ============================================

  return {
    // ============================================
    // STATE
    // ============================================
    lightweightMovieCache,
    similarMoviesCache,
    filters,
    isFiltering,
    likedMovieIds,

    // Embeddings state (from useDatabase)
    isEmbeddingsLoaded,
    isEmbeddingsLoading,
    currentEmbeddingsModelId,

    // ============================================
    // COMPUTED PROPERTIES
    // ============================================

    // Data views
    searchResultMovies,

    // Statistics
    totalMovies,
    totalFiltered,
    likedCount,
    activeFiltersCount,
    hasActiveFilters,
    currentSortOption,

    // ============================================
    // ACTIONS - Data Loading
    // ============================================
    loadFromFile,
    loadEmbeddings,
    fetchMoviesByIds,
    getMovieById,
    getSimilarMovies,
    getFilterOptions,
    mapMovieToLightweight,
    triggerSearchUpdate,

    // ============================================
    // ACTIONS - Likes
    // ============================================
    toggleLike,
    clearAllFilters,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMovieStore, import.meta.hot))
}
