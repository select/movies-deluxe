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

  // Liked movie IDs stored in localStorage using VueUse
  const likedMovieIds = useStorage<string[]>('movies-deluxe-liked', [])

  // Filter state stored in localStorage using VueUse
  const filters = useStorage<FilterState>('movies-deluxe-filters', DEFAULT_FILTERS)

  const isFiltering = ref(false)

  // Database composable
  const db = useDatabase()

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
    readonly imdbId: string
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
      imdbId: movie.imdbId,
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
   * Initialize database (user data loaded automatically via VueUse storage)
   * Called once on app initialization
   */
  const loadFromFile = async () => {
    console.log('[loadFromFile] Starting database initialization')

    try {
      // Initialize database from remote file and get total movie count
      totalMovies.value = await db.init(`${useRuntimeConfig().app.baseURL}data/movies.db`)
      console.log('[loadFromFile] Database initialized successfully')
      console.log('[loadFromFile] Total movies count:', totalMovies.value)

      isFiltering.value = false
    } catch (err) {
      console.error('[loadFromFile] Failed to initialize SQLite:', err)

      // Show toast notification for database initialization failure
      const { showToast } = useUiStore()
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
   * Fetch lightweight movie details for specific IDs (with caching)
   * Populates the lightweightMovieCache and does not return movies directly
   */
  const fetchMoviesByIds = async (imdbIds: string[]): Promise<void> => {
    if (!imdbIds || imdbIds.length === 0) return

    // Filter out IDs that are already cached or pending
    const uncachedIds = imdbIds.filter(
      id => !lightweightMovieCache.value.has(id) && !pendingIds.has(id)
    )

    if (uncachedIds.length === 0) {
      // All movies are either cached or already being fetched
      return
    }

    console.log('[fetchMoviesByIds] Fetching', uncachedIds.length, 'uncached movies from database')

    try {
      const lightweightMovies = await db.queryByIds<LightweightMovie>(uncachedIds)
      console.log('[fetchMoviesByIds] Fetched', lightweightMovies.length, 'movies from database')

      // Cache the results directly in the lightweight cache (no conversion needed)
      lightweightMovies.forEach(movie => {
        lightweightMovieCache.value.set(movie.imdbId, movie)
      })

      // Handle IDs that were not found in the database (e.g., temporary IDs or missing entries)
      const foundIds = new Set(lightweightMovies.map(m => m.imdbId))
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
  const getMovieById = async (imdbId: string): Promise<MovieEntry | undefined> => {
    console.log('[getMovieById] Getting movie:', imdbId)

    // Fetch full details from JSON file (static deployment)
    console.log('[getMovieById] Fetching from JSON file')
    try {
      const movie = await $fetch<MovieEntry>(
        `${useRuntimeConfig().app.baseURL}movies/${imdbId}.json`
      )
      // Validate that we got a proper movie object (not HTML or malformed data)
      if (movie && typeof movie === 'object' && movie.imdbId && movie.title) {
        console.log('[getMovieById] Successfully fetched movie from JSON')
        return movie
      }
      // If we got invalid data, treat it as not found
      console.warn('[getMovieById] Invalid movie data received')
      return undefined
    } catch (err) {
      console.error(`[getMovieById] Failed to fetch movie details for ${imdbId}:`, err)
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

    if (searchQuery?.trim()) {
      // Search query - use FTS5 full-text search
      const sanitizedQuery = searchQuery.replace(/"/g, '""').trim()
      sql = `
        SELECT m.imdbId
        FROM fts_movies f
        JOIN movies m ON f.imdbId = m.imdbId
        WHERE fts_movies MATCH ?
      `
      params.push(`"${sanitizedQuery}"`)
    } else {
      // No search query - query all movies
      sql = `
        SELECT m.imdbId
        FROM movies m
        WHERE 1=1
      `
    }

    // Add common filter conditions
    if (filters.value.minRating > 0) {
      sql += ` AND m.imdbRating >= ?`
      params.push(filters.value.minRating)
    }

    if (filters.value.minYear > 0) {
      sql += ` AND m.year >= ?`
      params.push(filters.value.minYear)
    }

    if (filters.value.maxYear && filters.value.maxYear > 0) {
      sql += ` AND m.year <= ?`
      params.push(filters.value.maxYear)
    }

    if (filters.value.minVotes > 0) {
      sql += ` AND m.imdbVotes >= ?`
      params.push(filters.value.minVotes)
    }

    if (filters.value.maxVotes && filters.value.maxVotes > 0) {
      sql += ` AND m.imdbVotes <= ?`
      params.push(filters.value.maxVotes)
    }

    // Add source filters (now in SQL for better performance)
    if (filters.value.sources.length > 0) {
      const sourceConditions: string[] = []

      filters.value.sources.forEach(source => {
        if (source === 'archive.org') {
          sourceConditions.push('m.primarySourceType = ?')
          params.push('archive.org')
        } else {
          // YouTube channel name
          sourceConditions.push('(m.primarySourceType = ? AND m.primaryChannelName = ?)')
          params.push('youtube', source)
        }
      })

      if (sourceConditions.length > 0) {
        sql += ` AND (${sourceConditions.join(' OR ')})`
      }
    }

    // Add genre filters (now in SQL using LIKE for comma-separated values)
    if (filters.value.genres.length > 0) {
      const genreConditions = filters.value.genres.map(
        () => '(m.genre LIKE ? OR m.genre LIKE ? OR m.genre LIKE ? OR m.genre = ?)'
      )

      filters.value.genres.forEach(genre => {
        // Match: "Genre, ...", "..., Genre, ...", "..., Genre", or exact "Genre"
        params.push(`${genre},%`, `%, ${genre},%`, `%, ${genre}`, genre)
      })

      sql += ` AND (${genreConditions.join(' OR ')})`
    }

    // Add country filters (now in SQL using LIKE for comma-separated values)
    if (filters.value.countries.length > 0) {
      const countryConditions = filters.value.countries.map(
        () => '(m.country LIKE ? OR m.country LIKE ? OR m.country LIKE ? OR m.country = ?)'
      )

      filters.value.countries.forEach(country => {
        // Match: "Country, ...", "..., Country, ...", "..., Country", or exact "Country"
        params.push(`${country},%`, `%, ${country},%`, `%, ${country}`, country)
      })

      sql += ` AND (${countryConditions.join(' OR ')})`
    }

    // Add sorting (only for non-search queries or when not using relevance)
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
        sql += ` ORDER BY m.year DESC` // Default sort
      }
    } else if (searchQuery?.trim()) {
      // For search queries, default to title order for consistency
      sql += ` ORDER BY m.title ASC`
    }

    return { sql, params }
  }

  /**
   * Execute unified filter query and return only movie IDs
   */
  const executeFilterQuery = async (sessionId: number): Promise<string[]> => {
    if (!db.isReady.value) {
      console.log('[executeFilterQuery] DB not ready, returning empty results')
      return []
    }

    try {
      const { sql, params } = buildFilterQuery(filters.value.searchQuery.trim())

      console.log('[executeFilterQuery] Executing query with', params.length, 'parameters')
      const results = await db.query<{ imdbId: string }>(sql, params)
      console.log('[executeFilterQuery] Found', results.length, 'matches')

      // Check if this request is still current
      if (sessionId !== currentSearchSessionId.value) {
        console.log('[executeFilterQuery] Request cancelled, ignoring results')
        return []
      }

      // Return only the IDs - no need to fetch full movie data or use cache
      return results.map(row => row.imdbId)
    } catch (err) {
      console.error('[executeFilterQuery] Query failed:', err)
      return []
    }
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
    filters,
    isFiltering,
    likedMovieIds,

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
    fetchMoviesByIds,
    getMovieById,
    getFilterOptions,
    mapMovieToLightweight,
    triggerSearchUpdate,

    // ============================================
    // ACTIONS - Likes
    // ============================================
    toggleLike,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMovieStore, import.meta.hot))
}
