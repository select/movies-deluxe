import type { MovieEntry, MovieSource, MovieSourceType, LightweightMovie } from '~/types'
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
  currentPage: 1,
  lastScrollY: 0,
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

  // Single source of truth - all movies stored here
  // Use shallowRef to avoid deep reactivity on movie objects (performance optimization)
  const allMovies = shallowRef<Map<string, MovieEntry>>(new Map())

  // Cache for lightweight movies (for grid display)
  // Use shallowRef to avoid deep reactivity on movie objects (performance optimization)
  const lightweightMovieCache = shallowRef<Map<string, LightweightMovie>>(new Map())

  // Liked movie IDs stored in localStorage using VueUse
  const likedMovieIds = useStorage<string[]>('movies-deluxe-liked', [])

  // Filter state stored in localStorage using VueUse
  const filters = useStorage<FilterState>('movies-deluxe-filters', DEFAULT_FILTERS)

  // Loading states
  const isLoading = ref<LoadingState>({
    movies: false,
    movieDetails: false,
    imdbFetch: false,
  })
  const isFiltering = ref(false)
  const isAppending = ref(false)

  // Database composable
  const db = useDatabase()

  // Track IDs currently being fetched to avoid duplicate requests
  const pendingIds = new Set<string>()

  // Track the latest request ID for filter/search queries to discard stale results
  const currentSearchSessionId = ref(0)

  // ============================================
  // COMPUTED PROPERTIES - Data Views
  // ============================================

  /**
   * Search result movies for virtual scrolling
   * Only includes essential fields (imdbId, title, year)
   * Can contain null values for movies that haven't been loaded yet
   */
  const searchResultMovies = ref<(LightweightMovie | null)[]>([])

  /**
   * Current movie list for navigation (uses lightweight movies for consistency with index page)
   * Returns the list of movie IDs in the same order as displayed on the index page
   * Falls back to all movies sorted by year if no filtering has been applied yet
   */
  const currentMovieList = computed((): (LightweightMovie | null)[] => {
    if (searchResultMovies.value.length > 0) {
      return searchResultMovies.value
    }
    // Fallback to all movies sorted by year (newest first) as lightweight entries
    return Array.from(allMovies.value.values())
      .filter(m => m.year !== undefined) // Filter out movies without year
      .sort((a, b) => (b.year || 0) - (a.year || 0))
      .map(m => ({ imdbId: m.imdbId, title: m.title, year: m.year || 0 }))
  })

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

  /**
   * Map SQL row to MovieEntry (lightweight version)
   * Sources are now loaded separately from JSON files
   */
  const mapRowToMovie = (row: LightweightMovie): MovieEntry => {
    // console.log('[mapRowToMovie] Mapping row:', row.imdbId, row.title)
    // Create a minimal source object from database fields for UI display
    const sources: MovieSource[] = []
    if (row.sourceType) {
      sources.push({
        type: row.sourceType,
        id: '', // Not available in database, but not needed for icon display
        url: '', // Not available in database, but not needed for icon display
        title: row.title,
        channelName: row.sourceType === 'youtube' ? row.channelName || undefined : undefined,
        addedAt: row.lastUpdated || new Date().toISOString(),
      })
    }

    return {
      imdbId: row.imdbId,
      title: row.title,
      year: row.year,
      lastUpdated: row.lastUpdated || new Date().toISOString(),
      sources,
      metadata: {
        imdbRating: row.imdbRating,
        imdbVotes: row.imdbVotes,
        imdbID: row.imdbId,
        Genre: row.genre,
        Language: row.language,
        Country: row.country,
      },
      verified: row.verified,
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
    isLoading.value.movies = true

    try {
      // Initialize database from remote file
      await db.init(`${useRuntimeConfig().app.baseURL}data/movies.db`)
      console.log('[loadFromFile] Database initialized successfully')

      // Get total movie count once database is ready
      totalMovies.value = await db.getMovieCount()
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
      isLoading.value.movies = false
      isFiltering.value = false
    }
  }

  /**
   * Fetch lightweight movie details for specific IDs (with caching)
   * Populates the lightweightMovieCache and does not return movies directly
   */
  const fetchMoviesByIds = async (imdbIds: string[]): Promise<void> => {
    if (!imdbIds || imdbIds.length === 0) return

    // Ensure cache is initialized
    if (!lightweightMovieCache.value) {
      lightweightMovieCache.value = new Map()
    }

    // Filter out IDs that are already cached or pending
    const uncachedIds = imdbIds.filter(
      id => !lightweightMovieCache.value.has(id) && !pendingIds.has(id)
    )

    if (uncachedIds.length === 0) {
      // All movies are either cached or already being fetched
      return
    }

    console.log('[fetchMoviesByIds] Fetching', uncachedIds.length, 'uncached movies from database')

    // Mark as pending
    uncachedIds.forEach(id => pendingIds.add(id))

    // Wait for database to be ready if it's still initializing
    if (!db.isReady.value) {
      // If not even started loading, start it
      if (isFiltering.value && !isLoading.value.movies) {
        loadFromFile()
      }

      // Wait for it to be ready
      let attempts = 0
      while (!db.isReady.value && attempts < 100) {
        // Max 10 seconds
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }

      if (!db.isReady.value) {
        console.error('[fetchMoviesByIds] Database not ready after waiting')
        uncachedIds.forEach(id => pendingIds.delete(id))
        return
      }
    }

    // Double check cache after waiting (another request might have filled it)
    const stillUncachedIds = uncachedIds.filter(id => !lightweightMovieCache.value.has(id))
    if (stillUncachedIds.length === 0) {
      uncachedIds.forEach(id => pendingIds.delete(id))
      return
    }

    try {
      const results = await db.queryByIds<LightweightMovie>(stillUncachedIds)
      const movies = results.map(mapRowToMovie)
      console.log('[fetchMoviesByIds] Fetched', movies.length, 'movies from database')

      // Cache the results in the lightweight cache
      movies.forEach(movie => {
        const lightweight = mapMovieToLightweight(movie)
        lightweightMovieCache.value.set(movie.imdbId, lightweight)
        // Also update allMovies if not present
        if (!allMovies.value.has(movie.imdbId)) {
          allMovies.value.set(movie.imdbId, movie)
        }
      })

      // Handle IDs that were not found in the database (e.g., temporary IDs or missing entries)
      const foundIds = new Set(movies.map(m => m.imdbId))
      const missingIds = stillUncachedIds.filter(id => !foundIds.has(id))

      if (missingIds.length > 0) {
        console.warn(
          '[fetchMoviesByIds]',
          missingIds.length,
          'movies not found in database:',
          missingIds
        )
        // Create minimal entries for movies not found in database
        // This prevents infinite loading states
        missingIds.forEach(id => {
          const minimalLightweight: LightweightMovie = {
            imdbId: id,
            title: id, // Fallback to ID as title
            year: 0,
          }
          const minimalEntry: MovieEntry = {
            imdbId: id,
            title: id, // Fallback to ID as title
            sources: [],
            lastUpdated: new Date().toISOString(),
          }
          lightweightMovieCache.value.set(id, minimalLightweight)
          if (!allMovies.value.has(id)) {
            allMovies.value.set(id, minimalEntry)
          }
        })
      }

      // Trigger reactivity by replacing the Map instances
      lightweightMovieCache.value = new Map(lightweightMovieCache.value)
      allMovies.value = new Map(allMovies.value)
    } catch (err) {
      console.error('[fetchMoviesByIds] Failed to fetch movies by IDs:', err)
    } finally {
      // Remove from pending
      uncachedIds.forEach(id => pendingIds.delete(id))
    }
  }

  /**
   * Get a single movie by ID (from cache or API)
   */
  const getMovieById = async (imdbId: string): Promise<MovieEntry | undefined> => {
    console.log('[getMovieById] Getting movie:', imdbId)

    // Check allMovies - if it has sources with valid IDs, it's a full entry
    if (allMovies.value.has(imdbId)) {
      const movie = allMovies.value.get(imdbId)
      if (movie && movie.sources && movie.sources.length > 0 && movie.sources[0]?.id) {
        console.log('[getMovieById] Found in allMovies with full sources')
        return movie
      }
    }

    // Fetch full details from JSON file (static deployment)
    console.log('[getMovieById] Fetching from JSON file')
    isLoading.value.movieDetails = true
    try {
      const movie = await $fetch<MovieEntry>(
        `${useRuntimeConfig().app.baseURL}movies/${imdbId}.json`
      )
      // Validate that we got a proper movie object (not HTML or malformed data)
      if (movie && typeof movie === 'object' && movie.imdbId && movie.title) {
        console.log('[getMovieById] Successfully fetched movie from JSON')
        // Store in allMovies instead of separate cache
        allMovies.value.set(imdbId, movie)
        return movie
      }
      // If we got invalid data, treat it as not found
      console.warn('[getMovieById] Invalid movie data received')
      return undefined
    } catch (err) {
      console.error(`[getMovieById] Failed to fetch movie details for ${imdbId}:`, err)
      return undefined
    } finally {
      isLoading.value.movieDetails = false
    }
  }

  // ============================================
  // FILTERING & SORTING ACTIONS
  // ============================================

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
    () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currentPage, lastScrollY, ...rest } = filters.value
      return JSON.stringify(rest)
    },
    async () => {
      // Only apply filters on the search page
      if (useRoute().path !== '/search') return

      // Increment session ID to cancel any pending requests from previous filter state
      currentSearchSessionId.value++
      const sessionId = currentSearchSessionId.value

      // Reset to page 1
      filters.value.currentPage = 1

      // Set filtering state
      isFiltering.value = true

      try {
        let filteredResults: MovieEntry[] = []

        // If there's a search query, search using FTS5 full-text search
        if (filters.value.searchQuery.trim()) {
          console.log('[watchFilters] Searching for:', filters.value.searchQuery)

          if (!db.isReady.value) {
            console.log('[watchFilters] DB not ready, using JS fallback search')
            // Fallback to simple JS search if DB is not ready
            const lowerQuery = filters.value.searchQuery.toLowerCase()
            const searchResults = Array.from(allMovies.value.values()).filter(
              (movie: MovieEntry) => {
                const titles = Array.isArray(movie.title) ? movie.title : [movie.title]
                return titles.some((t: string) => t.toLowerCase().includes(lowerQuery))
              }
            )
            filteredResults = searchResults
          } else {
            try {
              const sanitizedQuery = filters.value.searchQuery.replace(/"/g, '""').trim()
              const results = await db.query<{ imdbId: string }>(
                `
                SELECT m.imdbId
                FROM fts_movies f
                JOIN movies m ON f.imdbId = m.imdbId
                WHERE fts_movies MATCH ?
                ORDER BY m.title ASC
              `,
                [`"${sanitizedQuery}"`]
              )

              const matchedIds = new Set(results.map(r => r.imdbId as string))
              console.log('[watchFilters] Found', matchedIds.size, 'matches')
              const searchResults = Array.from(allMovies.value.values()).filter(m =>
                matchedIds.has(m.imdbId)
              )
              filteredResults = searchResults
            } catch (err) {
              console.error('[watchFilters] Search failed:', err)
              filteredResults = []
            }
          }

          // Check if this request is still current
          if (sessionId !== currentSearchSessionId.value) {
            console.log('[watchFilters] Search request cancelled, ignoring results')
            return
          }

          // Apply additional filters to search results
          console.log('[watchFilters] Applying filters to', filteredResults.length, 'movies')
          let filtered = [...filteredResults]

          // 1. Filter by source
          if (filters.value.sources.length > 0) {
            filtered = filtered.filter(movie => {
              return movie.sources.some((source: MovieSource) => {
                if (source.type === 'archive.org') {
                  return filters.value.sources.includes('archive.org')
                }
                if (source.type === 'youtube') {
                  return source.channelName
                    ? filters.value.sources.includes(source.channelName)
                    : false
                }
                return false
              })
            })
          }

          // 2. Filter by minimum rating
          if (filters.value.minRating > 0) {
            filtered = filtered.filter(movie => {
              const rating =
                typeof movie.metadata?.imdbRating === 'number' ? movie.metadata.imdbRating : 0
              return rating >= filters.value.minRating
            })
          }

          // 3. Filter by year range
          if (filters.value.minYear > 0 || (filters.value.maxYear && filters.value.maxYear > 0)) {
            filtered = filtered.filter(movie => {
              const year = movie.year || 0
              if (filters.value.minYear > 0 && year < filters.value.minYear) return false
              if (
                filters.value.maxYear &&
                filters.value.maxYear > 0 &&
                year > filters.value.maxYear
              )
                return false
              return true
            })
          }

          // 4. Filter by votes range
          if (
            filters.value.minVotes > 0 ||
            (filters.value.maxVotes && filters.value.maxVotes > 0)
          ) {
            filtered = filtered.filter(movie => {
              const votes = movie.metadata?.imdbVotes || 0
              if (filters.value.minVotes > 0 && votes < filters.value.minVotes) return false
              if (
                filters.value.maxVotes &&
                filters.value.maxVotes > 0 &&
                votes > filters.value.maxVotes
              )
                return false
              return true
            })
          }

          // 5. Filter by genres
          if (filters.value.genres.length > 0) {
            filtered = filtered.filter(movie => {
              const movieGenres =
                movie.metadata?.Genre?.split(', ').map((g: string) => g.trim()) || []
              return filters.value.genres.some(selectedGenre => movieGenres.includes(selectedGenre))
            })
          }

          // 6. Filter by countries
          if (filters.value.countries.length > 0) {
            filtered = filtered.filter(movie => {
              const movieCountries =
                movie.metadata?.Country?.split(', ').map((c: string) => c.trim()) || []
              return filters.value.countries.some(selectedCountry =>
                movieCountries.includes(selectedCountry)
              )
            })
          }

          // 8. Apply sorting
          const sortOption =
            SORT_OPTIONS.find(
              opt =>
                opt.field === filters.value.sort.field &&
                opt.direction === filters.value.sort.direction
            ) || SORT_OPTIONS[0]!

          if (sortOption.field !== 'relevance') {
            filtered = sortMovies(filtered, sortOption)
          }

          filteredResults = filtered
        } else {
          // No search query - get all movies and apply filters
          console.log('[watchFilters] Applying filters to all movies')
          const allMoviesArray = Array.from(allMovies.value.values())
          let filtered = [...allMoviesArray]

          // 1. Filter by source
          if (filters.value.sources.length > 0) {
            filtered = filtered.filter(movie => {
              return movie.sources.some((source: MovieSource) => {
                if (source.type === 'archive.org') {
                  return filters.value.sources.includes('archive.org')
                }
                if (source.type === 'youtube') {
                  return source.channelName
                    ? filters.value.sources.includes(source.channelName)
                    : false
                }
                return false
              })
            })
          }

          // 2. Filter by minimum rating
          if (filters.value.minRating > 0) {
            filtered = filtered.filter(movie => {
              const rating =
                typeof movie.metadata?.imdbRating === 'number' ? movie.metadata.imdbRating : 0
              return rating >= filters.value.minRating
            })
          }

          // 3. Filter by year range
          if (filters.value.minYear > 0 || (filters.value.maxYear && filters.value.maxYear > 0)) {
            filtered = filtered.filter(movie => {
              const year = movie.year || 0
              if (filters.value.minYear > 0 && year < filters.value.minYear) return false
              if (
                filters.value.maxYear &&
                filters.value.maxYear > 0 &&
                year > filters.value.maxYear
              )
                return false
              return true
            })
          }

          // 4. Filter by votes range
          if (
            filters.value.minVotes > 0 ||
            (filters.value.maxVotes && filters.value.maxVotes > 0)
          ) {
            filtered = filtered.filter(movie => {
              const votes = movie.metadata?.imdbVotes || 0
              if (filters.value.minVotes > 0 && votes < filters.value.minVotes) return false
              if (
                filters.value.maxVotes &&
                filters.value.maxVotes > 0 &&
                votes > filters.value.maxVotes
              )
                return false
              return true
            })
          }

          // 5. Filter by genres
          if (filters.value.genres.length > 0) {
            filtered = filtered.filter(movie => {
              const movieGenres =
                movie.metadata?.Genre?.split(', ').map((g: string) => g.trim()) || []
              return filters.value.genres.some(selectedGenre => movieGenres.includes(selectedGenre))
            })
          }

          // 6. Filter by countries
          if (filters.value.countries.length > 0) {
            filtered = filtered.filter(movie => {
              const movieCountries =
                movie.metadata?.Country?.split(', ').map((c: string) => c.trim()) || []
              return filters.value.countries.some(selectedCountry =>
                movieCountries.includes(selectedCountry)
              )
            })
          }

          // 8. Apply sorting
          const sortOption =
            SORT_OPTIONS.find(
              opt =>
                opt.field === filters.value.sort.field &&
                opt.direction === filters.value.sort.direction
            ) || SORT_OPTIONS[0]!

          if (sortOption.field !== 'relevance') {
            filtered = sortMovies(filtered, sortOption)
          }

          filteredResults = filtered

          // Check if this request is still current
          if (sessionId !== currentSearchSessionId.value) {
            console.log('[watchFilters] Filter request cancelled, ignoring results')
            return
          }
        }

        // Extract movie IDs from filtered results
        // const movieIds = filteredResults.map(movie => movie.imdbId)

        // Store the filtered movies in the cache (they're already full MovieEntry objects)
        filteredResults.forEach(movie => {
          allMovies.value.set(movie.imdbId, movie)
        })

        // Convert to lightweight movies for the search results
        searchResultMovies.value = filteredResults.map(movie => ({
          imdbId: movie.imdbId,
          title: movie.title,
          year: movie.year || 0,
        }))

        totalFiltered.value = filteredResults.length

        console.log(
          '[watchFilters] Updated search results:',
          searchResultMovies.value.length,
          'movies'
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
      let filteredResults: MovieEntry[] = []

      // If there's a search query, search using FTS5 full-text search
      if (filters.value.searchQuery.trim()) {
        console.log('[triggerSearchUpdate] Searching for:', filters.value.searchQuery)

        if (!db.isReady.value) {
          console.log('[triggerSearchUpdate] DB not ready, using JS fallback search')
          // Fallback to simple JS search if DB is not ready
          const lowerQuery = filters.value.searchQuery.toLowerCase()
          const searchResults = Array.from(allMovies.value.values()).filter((movie: MovieEntry) => {
            const titles = Array.isArray(movie.title) ? movie.title : [movie.title]
            return titles.some((t: string) => t.toLowerCase().includes(lowerQuery))
          })
          filteredResults = searchResults
        } else {
          try {
            const sanitizedQuery = filters.value.searchQuery.replace(/"/g, '""').trim()
            const results = await db.query<{ imdbId: string }>(
              `
              SELECT m.imdbId
              FROM fts_movies f
              JOIN movies m ON f.imdbId = m.imdbId
              WHERE fts_movies MATCH ?
              ORDER BY m.title ASC
            `,
              [`"${sanitizedQuery}"`]
            )

            const matchedIds = new Set(results.map(r => r.imdbId as string))
            console.log('[triggerSearchUpdate] Found', matchedIds.size, 'matches')
            const searchResults = Array.from(allMovies.value.values()).filter(m =>
              matchedIds.has(m.imdbId)
            )
            filteredResults = searchResults
          } catch (err) {
            console.error('[triggerSearchUpdate] Search failed:', err)
            filteredResults = []
          }
        }

        // Apply additional filters to search results
        console.log('[triggerSearchUpdate] Applying filters to', filteredResults.length, 'movies')
        let filtered = [...filteredResults]

        // 1. Filter by source
        if (filters.value.sources.length > 0) {
          filtered = filtered.filter(movie => {
            return movie.sources.some((source: MovieSource) => {
              if (source.type === 'archive.org') {
                return filters.value.sources.includes('archive.org')
              }
              if (source.type === 'youtube') {
                return source.channelName
                  ? filters.value.sources.includes(source.channelName)
                  : false
              }
              return false
            })
          })
        }

        // 2. Filter by minimum rating
        if (filters.value.minRating > 0) {
          filtered = filtered.filter(movie => {
            const rating =
              typeof movie.metadata?.imdbRating === 'number' ? movie.metadata.imdbRating : 0
            return rating >= filters.value.minRating
          })
        }

        // 3. Filter by year range
        if (filters.value.minYear > 0 || (filters.value.maxYear && filters.value.maxYear > 0)) {
          filtered = filtered.filter(movie => {
            const year = movie.year || 0
            if (filters.value.minYear > 0 && year < filters.value.minYear) return false
            if (filters.value.maxYear && filters.value.maxYear > 0 && year > filters.value.maxYear)
              return false
            return true
          })
        }

        // 4. Filter by votes range
        if (filters.value.minVotes > 0 || (filters.value.maxVotes && filters.value.maxVotes > 0)) {
          filtered = filtered.filter(movie => {
            const votes = movie.metadata?.imdbVotes || 0
            if (filters.value.minVotes > 0 && votes < filters.value.minVotes) return false
            if (
              filters.value.maxVotes &&
              filters.value.maxVotes > 0 &&
              votes > filters.value.maxVotes
            )
              return false
            return true
          })
        }

        // 5. Filter by genres
        if (filters.value.genres.length > 0) {
          filtered = filtered.filter(movie => {
            const movieGenres =
              movie.metadata?.Genre?.split(', ').map((g: string) => g.trim()) || []
            return filters.value.genres.some(selectedGenre => movieGenres.includes(selectedGenre))
          })
        }

        // 6. Filter by countries
        if (filters.value.countries.length > 0) {
          filtered = filtered.filter(movie => {
            const movieCountries =
              movie.metadata?.Country?.split(', ').map((c: string) => c.trim()) || []
            return filters.value.countries.some(selectedCountry =>
              movieCountries.includes(selectedCountry)
            )
          })
        }

        // 8. Apply sorting
        const sortOption =
          SORT_OPTIONS.find(
            opt =>
              opt.field === filters.value.sort.field &&
              opt.direction === filters.value.sort.direction
          ) || SORT_OPTIONS[0]!

        if (sortOption.field !== 'relevance') {
          filtered = sortMovies(filtered, sortOption)
        }

        filteredResults = filtered
      } else {
        // No search query - get all movies and apply filters
        console.log('[triggerSearchUpdate] Applying filters to all movies')
        const allMoviesArray = Array.from(allMovies.value.values())
        let filtered = [...allMoviesArray]

        // 1. Filter by source
        if (filters.value.sources.length > 0) {
          filtered = filtered.filter(movie => {
            return movie.sources.some((source: MovieSource) => {
              if (source.type === 'archive.org') {
                return filters.value.sources.includes('archive.org')
              }
              if (source.type === 'youtube') {
                return source.channelName
                  ? filters.value.sources.includes(source.channelName)
                  : false
              }
              return false
            })
          })
        }

        // 2. Filter by minimum rating
        if (filters.value.minRating > 0) {
          filtered = filtered.filter(movie => {
            const rating =
              typeof movie.metadata?.imdbRating === 'number' ? movie.metadata.imdbRating : 0
            return rating >= filters.value.minRating
          })
        }

        // 3. Filter by year range
        if (filters.value.minYear > 0 || (filters.value.maxYear && filters.value.maxYear > 0)) {
          filtered = filtered.filter(movie => {
            const year = movie.year || 0
            if (filters.value.minYear > 0 && year < filters.value.minYear) return false
            if (filters.value.maxYear && filters.value.maxYear > 0 && year > filters.value.maxYear)
              return false
            return true
          })
        }

        // 4. Filter by votes range
        if (filters.value.minVotes > 0 || (filters.value.maxVotes && filters.value.maxVotes > 0)) {
          filtered = filtered.filter(movie => {
            const votes = movie.metadata?.imdbVotes || 0
            if (filters.value.minVotes > 0 && votes < filters.value.minVotes) return false
            if (
              filters.value.maxVotes &&
              filters.value.maxVotes > 0 &&
              votes > filters.value.maxVotes
            )
              return false
            return true
          })
        }

        // 5. Filter by genres
        if (filters.value.genres.length > 0) {
          filtered = filtered.filter(movie => {
            const movieGenres =
              movie.metadata?.Genre?.split(', ').map((g: string) => g.trim()) || []
            return filters.value.genres.some(selectedGenre => movieGenres.includes(selectedGenre))
          })
        }

        // 6. Filter by countries
        if (filters.value.countries.length > 0) {
          filtered = filtered.filter(movie => {
            const movieCountries =
              movie.metadata?.Country?.split(', ').map((c: string) => c.trim()) || []
            return filters.value.countries.some(selectedCountry =>
              movieCountries.includes(selectedCountry)
            )
          })
        }

        // 8. Apply sorting
        const sortOption =
          SORT_OPTIONS.find(
            opt =>
              opt.field === filters.value.sort.field &&
              opt.direction === filters.value.sort.direction
          ) || SORT_OPTIONS[0]!

        if (sortOption.field !== 'relevance') {
          filtered = sortMovies(filtered, sortOption)
        }

        filteredResults = filtered
      }

      // Extract movie IDs from filtered results
      // const movieIds = filteredResults.map(movie => movie.imdbId)

      // Store the filtered movies in the cache (they're already full MovieEntry objects)
      filteredResults.forEach(movie => {
        allMovies.value.set(movie.imdbId, movie)
      })

      // Convert to lightweight movies for the search results
      searchResultMovies.value = filteredResults.map(movie => ({
        imdbId: movie.imdbId,
        title: movie.title,
        year: movie.year || 0,
      }))

      totalFiltered.value = filteredResults.length

      console.log(
        '[triggerSearchUpdate] Updated search results:',
        searchResultMovies.value.length,
        'movies'
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
    allMovies,
    lightweightMovieCache,
    filters,
    isFiltering,
    isAppending,
    isLoading,
    likedMovieIds,

    // ============================================
    // COMPUTED PROPERTIES
    // ============================================

    // Data views
    searchResultMovies,
    currentMovieList,

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
    mapRowToMovie,
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
