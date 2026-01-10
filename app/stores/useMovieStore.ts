import type {
  MovieEntry,
  MovieSource,
  MovieSourceType,
  YouTubeSource,
  ArchiveOrgSource,
  LightweightMovieEntry,
} from '~/types'
import type { LightweightMovie } from '~/types/database'
import { useStorage } from '@vueuse/core'

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
 * Database row interface for movies table
 */
interface MovieDatabaseRow {
  imdbId: string
  title: string
  year?: number
  lastUpdated: string
  imdbRating?: number
  imdbVotes?: number
  genre?: string
  language?: string
  country?: string
  primarySourceType?: MovieSourceType
  primaryChannelName?: string
  verified?: boolean
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

  // Cache for movie details
  // Use shallowRef to avoid deep reactivity on movie objects (performance optimization)
  const movieDetailsCache = shallowRef<Map<string, MovieEntry>>(new Map())

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
  const isInitialLoading = ref(true)
  const isFiltering = ref(false)

  // Database composable
  const db = useDatabase()

  // Cached poster existence checks
  const posterCache = ref<Map<string, boolean>>(new Map())

  // ============================================
  // COMPUTED PROPERTIES - Data Views
  // ============================================

  /**
   * Lightweight movies for virtual scrolling
   * Only includes essential fields (imdbId, title, year)
   */
  const lightweightMovies = ref<LightweightMovieEntry[]>([])

  /**
   * Filtered and sorted movies for display
   */
  const filteredAndSortedMovies = ref<MovieEntry[]>([])

  /**
   * Current movie list for navigation (uses lightweight movies for consistency with index page)
   * Returns the list of movie IDs in the same order as displayed on the index page
   * Falls back to all movies sorted by year if no filtering has been applied yet
   */
  const currentMovieList = computed((): LightweightMovieEntry[] => {
    if (lightweightMovies.value.length > 0) {
      return lightweightMovies.value
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
   * Total number of movies in the database
   */
  const totalMovies = computed((): number => allMovies.value.size)

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
   * Map LightweightMovie to MovieEntry
   * Sources are now loaded separately from JSON files
   */
  const mapLightweightToMovie = (movie: LightweightMovie): MovieEntry => {
    return {
      imdbId: movie.imdbId,
      title: movie.title,
      year: movie.year,
      lastUpdated: new Date().toISOString(), // Not available in lightweight version
      sources: [], // Sources will be loaded from JSON files when needed
      metadata: {
        imdbRating:
          typeof movie.imdbRating === 'number'
            ? movie.imdbRating.toString()
            : movie.imdbRating?.toString(),
        imdbVotes:
          typeof movie.imdbVotes === 'number'
            ? movie.imdbVotes.toLocaleString()
            : movie.imdbVotes?.toString(),
        imdbID: movie.imdbId,
        Language: movie.language,
      },
    }
  }

  /**
   * Map SQL row to MovieEntry (lightweight version)
   * Sources are now loaded separately from JSON files
   */
  const mapRowToMovie = (row: MovieDatabaseRow): MovieEntry => {
    // Create a minimal source object from database fields for UI display
    const sources: MovieSource[] = []
    if (row.primarySourceType) {
      const sourceType = row.primarySourceType
      if (sourceType === 'youtube' && row.primaryChannelName) {
        sources.push({
          type: 'youtube',
          id: '', // Not available in database, but not needed for icon display
          url: '', // Not available in database, but not needed for icon display
          title: row.title,
          channelName: row.primaryChannelName,
          addedAt: row.lastUpdated,
        } as YouTubeSource)
      } else if (sourceType === 'archive.org') {
        sources.push({
          type: 'archive.org',
          id: '', // Not available in database, but not needed for icon display
          url: '', // Not available in database, but not needed for icon display
          title: row.title,
          addedAt: row.lastUpdated,
        } as ArchiveOrgSource)
      }
    }

    return {
      imdbId: row.imdbId,
      title: row.title,
      year: row.year,
      lastUpdated: row.lastUpdated,
      sources,
      metadata: {
        imdbRating: row.imdbRating?.toString(),
        imdbVotes: row.imdbVotes?.toLocaleString(),
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
    isLoading.value.movies = true

    try {
      // Initialize database from remote file
      await db.init(`${useRuntimeConfig().app.baseURL}data/movies.db`)

      isInitialLoading.value = false
    } catch (err) {
      window.console.error('Failed to initialize SQLite:', err)

      // Show toast notification for database initialization failure
      const { showToast } = useUiStore()
      showToast(
        'Failed to load movie database. Please refresh the page to try again.',
        'error',
        5000
      )
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Fetch total count of movies matching filters
   */
  const fetchMovieCount = async (): Promise<number> => {
    // Wait for database to be ready if it's still initializing
    if (!db.isReady.value) {
      if (isInitialLoading.value && !isLoading.value.movies) {
        loadFromFile()
      }

      let attempts = 0
      while (!db.isReady.value && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }

      if (!db.isReady.value) {
        window.console.error('[MovieStore] Database not ready for count')
        return 0
      }
    }

    try {
      const params: (string | number)[] = []
      const where: string[] = []

      // Apply filters (same logic as fetchLightweightMovies)
      if (filters.value.minRating > 0) {
        where.push('m.imdbRating >= ?')
        params.push(filters.value.minRating)
      }
      if (filters.value.minYear > 0) {
        where.push('m.year >= ?')
        params.push(filters.value.minYear)
      }
      if (filters.value.maxYear && filters.value.maxYear > 0) {
        where.push('m.year <= ?')
        params.push(filters.value.maxYear)
      }
      if (filters.value.minVotes > 0) {
        where.push('m.imdbVotes >= ?')
        params.push(filters.value.minVotes)
      }
      if (filters.value.maxVotes && filters.value.maxVotes > 0) {
        where.push('m.imdbVotes <= ?')
        params.push(filters.value.maxVotes)
      }

      // Genre filters
      if (filters.value.genres.length > 0) {
        filters.value.genres.forEach(genre => {
          where.push('m.genre LIKE ?')
          params.push(`%${genre}%`)
        })
      }

      // Country filters
      if (filters.value.countries.length > 0) {
        filters.value.countries.forEach(country => {
          where.push('m.country LIKE ?')
          params.push(`%${country}%`)
        })
      }

      const count = await db.getMovieCount({
        where: where.join(' AND '),
        params,
      })

      totalFiltered.value = count
      return count
    } catch (err) {
      window.console.error('[MovieStore] Failed to fetch movie count:', err)
      return 0
    }
  }

  /**
   * Fetch movies from database (lightweight version)
   */
  const fetchMovies = async (options: {
    where?: string
    params?: (string | number)[]
    orderBy?: string
    limit?: number
    offset?: number
    includeCount?: boolean
    searchQuery?: string
  }) => {
    if (!db.isReady.value) return { result: [], totalCount: 0 }

    const { searchQuery, where, params = [], orderBy, limit, offset, includeCount } = options

    let finalWhere = where || ''
    const finalParams = [...params]

    if (searchQuery?.trim()) {
      // Use FTS5 search
      const searchWhere =
        'EXISTS (SELECT 1 FROM fts_movies f WHERE f.imdbId = m.imdbId AND fts_movies MATCH ?)'
      finalWhere = finalWhere ? `(${finalWhere}) AND (${searchWhere})` : searchWhere

      // Sanitize search query for FTS5
      const sanitizedQuery = searchQuery.replace(/"/g, '""').trim()
      finalParams.push(`"${sanitizedQuery}"`)
    }

    const { result, totalCount } = await db.lightweightQuery({
      where: finalWhere,
      params: finalParams,
      orderBy: orderBy || 'm.year DESC, m.imdbId',
      limit,
      offset,
      includeCount,
    })

    return {
      result: result.map(mapLightweightToMovie),
      totalCount: totalCount || 0,
    }
  }

  /**
   * Fetch lightweight movie details for specific IDs (with caching)
   * Returns essential fields for grid display
   */
  const fetchMoviesByIds = async (imdbIds: string[]): Promise<MovieEntry[]> => {
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

    // Wait for database to be ready if it's still initializing
    if (!db.isReady.value) {
      // If not even started loading, start it
      if (isInitialLoading.value && !isLoading.value.movies) {
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
        window.console.error('[MovieStore] Database not ready after waiting')
        return []
      }
    }

    // Double check cache after waiting (another request might have filled it)
    const stillUncachedIds = imdbIds.filter(id => !movieDetailsCache.value.has(id))
    if (stillUncachedIds.length === 0) {
      return imdbIds.map(id => movieDetailsCache.value.get(id)!).filter(Boolean)
    }

    try {
      const results = await db.queryByIds<MovieDatabaseRow>(stillUncachedIds)
      const movies = results.map(mapRowToMovie)

      // Cache the results and merge with allMovies
      movies.forEach(movie => {
        movieDetailsCache.value.set(movie.imdbId, movie)
        // Also update allMovies if not present
        if (!allMovies.value.has(movie.imdbId)) {
          allMovies.value.set(movie.imdbId, movie)
        }
      })

      // Return all requested movies (cached + newly fetched)
      return imdbIds.map(id => movieDetailsCache.value.get(id)!).filter(Boolean)
    } catch (err) {
      window.console.error('[MovieStore] Failed to fetch movies by IDs:', err)
      return []
    }
  }

  /**
   * Get a single movie by ID (from cache or API)
   */
  const getMovieById = async (imdbId: string): Promise<MovieEntry | undefined> => {
    // Check cache first - but only if it has sources loaded with valid IDs
    if (movieDetailsCache.value.has(imdbId)) {
      const cached = movieDetailsCache.value.get(imdbId)
      if (cached && cached.sources && cached.sources.length > 0 && cached.sources[0]?.id) {
        return cached
      }
    }

    // Check allMovies - if it has sources with valid IDs, it's a full entry
    if (allMovies.value.has(imdbId)) {
      const movie = allMovies.value.get(imdbId)
      if (movie && movie.sources && movie.sources.length > 0 && movie.sources[0]?.id) {
        return movie
      }
    }

    // Fetch full details from JSON file (static deployment)
    isLoading.value.movieDetails = true
    try {
      const movie = await $fetch<MovieEntry>(
        `${useRuntimeConfig().app.baseURL}movies/${imdbId}.json`
      )
      // Validate that we got a proper movie object (not HTML or malformed data)
      if (movie && typeof movie === 'object' && movie.imdbId && movie.title) {
        movieDetailsCache.value.set(imdbId, movie)
        return movie
      }
      // If we got invalid data, treat it as not found
      return undefined
    } catch (err) {
      window.console.error(`[MovieStore] Failed to fetch movie details for ${imdbId}:`, err)
      return undefined
    } finally {
      isLoading.value.movieDetails = false
    }
  }

  /**
   * Get related movies for a given movie ID
   * Fetches full lightweight data from database for proper display
   */
  const getRelatedMovies = async (movieId: string, _limit: number = 8): Promise<MovieEntry[]> => {
    try {
      // First try to get the movie data from cache to avoid duplicate fetching
      let movie: MovieEntry | undefined

      // Check if movie is already cached with full data
      if (movieDetailsCache.value.has(movieId)) {
        const cached = movieDetailsCache.value.get(movieId)
        if (cached && cached.sources && cached.sources.length > 0) {
          movie = cached
        }
      }

      // If not in cache, use getMovieById which handles caching
      if (!movie) {
        movie = await getMovieById(movieId)
      }

      if (!movie || !movie.relatedMovies || movie.relatedMovies.length === 0) {
        return []
      }

      // If database is not ready, start loading it in background but don't wait for it
      // unless we really need it for better related movies display
      if (!db.isReady.value && !isLoading.value.movies && isInitialLoading.value) {
        loadFromFile()
      }

      // If database is ready, fetch full lightweight data for related movies
      if (db.isReady.value) {
        const relatedIds = movie.relatedMovies.map(rm => rm.imdbId)
        const fullMovies = await fetchMoviesByIds(relatedIds)
        return fullMovies
      }

      // Fallback: use the lightweight data from JSON if database is not ready
      return movie.relatedMovies.map(rm => ({
        imdbId: rm.imdbId,
        title: rm.title,
        year: rm.year,
        sources: [],
        lastUpdated: new Date().toISOString(),
        metadata: {
          imdbRating: rm.imdbRating?.toString(),
          imdbVotes: rm.imdbVotes?.toString(),
          Language: rm.language,
        },
      }))
    } catch (err) {
      window.console.error('[MovieStore] Failed to fetch related movies:', err)
      return []
    }
  }

  /**
   * Search movies using FTS5 full-text search
   */
  const searchMovies = async (searchQuery: string): Promise<MovieEntry[]> => {
    if (!searchQuery || !searchQuery.trim()) {
      return Array.from(allMovies.value.values())
    }

    if (!db.isReady.value) {
      // Fallback to simple JS search if DB is not ready
      const lowerQuery = searchQuery.toLowerCase()
      return Array.from(allMovies.value.values()).filter((movie: MovieEntry) => {
        const titles = Array.isArray(movie.title) ? movie.title : [movie.title]
        return titles.some((t: string) => t.toLowerCase().includes(lowerQuery))
      })
    }

    try {
      const sanitizedQuery = searchQuery.replace(/"/g, '""').trim()
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
      return Array.from(allMovies.value.values()).filter(m => matchedIds.has(m.imdbId))
    } catch (err) {
      window.console.error('[MovieStore] Search failed:', err)
      return []
    }
  }

  // ============================================
  // FILTERING & SORTING ACTIONS
  // ============================================

  /**
   * Fetch lightweight movie list (IDs and titles only) for virtual scrolling
   */
  const fetchLightweightMovies = async (options: { limit?: number; offset?: number } = {}) => {
    if (!db.isReady.value) {
      window.console.log('DB not ready, cannot fetch lightweight movies')
      return
    }

    const { limit, offset } = options
    const isInitial = offset === undefined || offset === 0

    if (isInitial) {
      isFiltering.value = true
    }

    try {
      const params: (string | number)[] = []
      const where: string[] = []

      // Apply filters
      if (filters.value.minRating > 0) {
        where.push('m.imdbRating >= ?')
        params.push(filters.value.minRating)
      }
      if (filters.value.minYear > 0) {
        where.push('m.year >= ?')
        params.push(filters.value.minYear)
      }
      if (filters.value.maxYear && filters.value.maxYear > 0) {
        where.push('m.year <= ?')
        params.push(filters.value.maxYear)
      }
      if (filters.value.minVotes > 0) {
        where.push('m.imdbVotes >= ?')
        params.push(filters.value.minVotes)
      }
      if (filters.value.maxVotes && filters.value.maxVotes > 0) {
        where.push('m.imdbVotes <= ?')
        params.push(filters.value.maxVotes)
      }

      // Genre filters
      if (filters.value.genres.length > 0) {
        filters.value.genres.forEach(genre => {
          where.push('m.genre LIKE ?')
          params.push(`%${genre}%`)
        })
      }

      // Country filters
      if (filters.value.countries.length > 0) {
        filters.value.countries.forEach(country => {
          where.push('m.country LIKE ?')
          params.push(`%${country}%`)
        })
      }

      // Source filters require joins, so use full query
      if (filters.value.sources.length > 0) {
        await fetchFilteredMovies(offset !== undefined && offset > 0)
        return
      }

      // Sorting
      let orderBy = ''
      const sortField = filters.value.sort.field
      const sortDir = filters.value.sort.direction.toUpperCase()

      if (sortField === 'relevance' && filters.value.searchQuery) {
        // For search, we need to use FTS which requires full query
        await fetchFilteredMovies(offset !== undefined && offset > 0)
        return
      } else if (sortField === 'rating') {
        orderBy = `m.imdbRating ${sortDir}`
      } else if (sortField === 'year') {
        orderBy = `m.year ${sortDir}`
      } else if (sortField === 'title') {
        orderBy = `m.title ${sortDir}`
      } else if (sortField === 'votes') {
        orderBy = `m.imdbVotes ${sortDir}`
      }

      const { result, totalCount } = await db.lightweightQuery({
        where: where.join(' AND '),
        params,
        orderBy,
        limit,
        offset,
        includeCount: isInitial,
      })

      if (isInitial) {
        lightweightMovies.value = result || []
        if (totalCount !== undefined) {
          totalFiltered.value = totalCount
        }
      } else {
        // Append results for now, until we implement full range tracking
        lightweightMovies.value = [...lightweightMovies.value, ...(result || [])]
      }
    } catch (err: unknown) {
      window.window.console.error('[MovieStore] Lightweight query failed:', err)
      if (isInitial) {
        lightweightMovies.value = []
      }
    } finally {
      if (isInitial) {
        isFiltering.value = false
      }
    }
  }

  /**
   * Fetch movies from SQLite based on current filters
   */
  const fetchFilteredMovies = async (append = false) => {
    if (!db.isReady.value) {
      // Fallback to JS filtering if DB not ready
      window.window.console.error('DB not ready, using JS filtering')
      const allMoviesArray = await searchMovies(filters.value.searchQuery)
      filteredAndSortedMovies.value = applyFilters(allMoviesArray)
      totalFiltered.value = filteredAndSortedMovies.value.length
      return
    }

    if (!append) {
      isFiltering.value = true
    }
    try {
      const params: (string | number)[] = []
      const where: string[] = []

      // Filters
      if (filters.value.minRating > 0) {
        where.push('m.imdbRating >= ?')
        params.push(filters.value.minRating)
      }
      if (filters.value.minYear > 0) {
        where.push('m.year >= ?')
        params.push(filters.value.minYear)
      }
      if (filters.value.maxYear && filters.value.maxYear > 0) {
        where.push('m.year <= ?')
        params.push(filters.value.maxYear)
      }
      if (filters.value.minVotes > 0) {
        where.push('m.imdbVotes >= ?')
        params.push(filters.value.minVotes)
      }
      if (filters.value.maxVotes && filters.value.maxVotes > 0) {
        where.push('m.imdbVotes <= ?')
        params.push(filters.value.maxVotes)
      }

      // Source filters
      if (filters.value.sources.length > 0) {
        const sourceConditions: string[] = []
        if (filters.value.sources.includes('archive.org')) {
          sourceConditions.push("s.type = 'archive.org'")
        }
        const youtubeChannels = filters.value.sources.filter(s => s !== 'archive.org')
        if (youtubeChannels.length > 0) {
          sourceConditions.push(
            `(s.type = 'youtube' AND c.name IN (${youtubeChannels.map(() => '?').join(',')}))`
          )
          params.push(...youtubeChannels)
        }
        if (sourceConditions.length > 0) {
          where.push(`(${sourceConditions.join(' OR ')})`)
        }
      }

      // Genre filters
      if (filters.value.genres.length > 0) {
        filters.value.genres.forEach(genre => {
          where.push('m.genre LIKE ?')
          params.push(`%${genre}%`)
        })
      }

      // Country filters
      if (filters.value.countries.length > 0) {
        filters.value.countries.forEach(country => {
          where.push('m.country LIKE ?')
          params.push(`%${country}%`)
        })
      }

      // Sorting
      let orderBy = ''
      const sortField = filters.value.sort.field
      const sortDir = filters.value.sort.direction.toUpperCase()

      // When searching, ignore relevance sort and just use title
      if (sortField === 'relevance' && filters.value.searchQuery) {
        orderBy = `m.title ${sortDir}`
      } else if (sortField === 'rating') {
        orderBy = `m.imdbRating ${sortDir}`
      } else if (sortField === 'year') {
        orderBy = `m.year ${sortDir}`
      } else if (sortField === 'title') {
        orderBy = `m.title ${sortDir}`
      } else if (sortField === 'votes') {
        orderBy = `m.imdbVotes ${sortDir}`
      }

      const itemsPerPage = 50
      const limit = filters.value.currentPage * itemsPerPage
      const offset = append ? (filters.value.currentPage - 1) * itemsPerPage : 0

      const { result, totalCount } = await fetchMovies({
        searchQuery: filters.value.searchQuery,
        where: where.join(' AND '),
        params,
        orderBy,
        limit: append ? itemsPerPage : limit,
        offset,
        includeCount: true,
      })

      if (append) {
        filteredAndSortedMovies.value = [...filteredAndSortedMovies.value, ...result]
        // Also append to lightweight movies for virtual scrolling
        lightweightMovies.value = [
          ...lightweightMovies.value,
          ...result.map(m => ({
            imdbId: m.imdbId,
            title: m.title,
            year: m.year || 0,
          })),
        ]
      } else {
        filteredAndSortedMovies.value = result
        // Also populate lightweight movies for virtual scrolling
        lightweightMovies.value = result.map(m => ({
          imdbId: m.imdbId,
          title: m.title,
          year: m.year || 0,
        }))
      }

      if (totalCount !== undefined) {
        totalFiltered.value = totalCount
      }
    } catch (err: unknown) {
      window.window.console.error('[MovieStore] SQL filtering failed:', err)
      filteredAndSortedMovies.value = []
    } finally {
      isFiltering.value = false
    }
  }

  /**
   * Apply all filters to a list of movies (for JS fallback or liked.vue)
   */
  const applyFilters = (movies: MovieEntry[]): MovieEntry[] => {
    let filtered = [...movies]

    // 1. Filter by source
    if (filters.value.sources.length > 0) {
      filtered = filtered.filter(movie => {
        return movie.sources.some((source: MovieSource) => {
          if (source.type === 'archive.org') {
            return filters.value.sources.includes('archive.org')
          }
          if (source.type === 'youtube') {
            return filters.value.sources.includes(source.channelName)
          }
          return false
        })
      })
    }

    // 2. Filter by minimum rating
    if (filters.value.minRating > 0) {
      filtered = filtered.filter(movie => {
        const rating = parseFloat(movie.metadata?.imdbRating || '0')
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
        const votesStr = movie.metadata?.imdbVotes
        const votes =
          typeof votesStr === 'number'
            ? votesStr
            : parseInt(String(votesStr || '0').replace(/,/g, ''))
        if (filters.value.minVotes > 0 && votes < filters.value.minVotes) return false
        if (filters.value.maxVotes && filters.value.maxVotes > 0 && votes > filters.value.maxVotes)
          return false
        return true
      })
    }

    // 5. Filter by genres
    if (filters.value.genres.length > 0) {
      filtered = filtered.filter(movie => {
        const movieGenres = movie.metadata?.Genre?.split(', ').map((g: string) => g.trim()) || []
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
          opt.field === filters.value.sort.field && opt.direction === filters.value.sort.direction
      ) || SORT_OPTIONS[0]!

    if (sortOption.field !== 'relevance') {
      filtered = sortMovies(filtered, sortOption)
    }

    return filtered
  }

  /**
   * Set sort option
   */
  const setSort = (sort: SortState) => {
    filters.value.sort = { field: sort.field, direction: sort.direction }

    if (filters.value.searchQuery !== '') {
      filters.value.previousSort = undefined
    }
  }

  /**
   * Set search query
   */
  const setSearchQuery = (query: string) => {
    const wasEmpty = filters.value.searchQuery === ''
    const isNowEmpty = query === ''

    if (wasEmpty && !isNowEmpty) {
      filters.value.previousSort = { ...filters.value.sort }
      filters.value.sort = { field: 'relevance', direction: 'desc' }
    } else if (!wasEmpty && isNowEmpty && filters.value.previousSort) {
      filters.value.sort = { ...filters.value.previousSort }
      filters.value.previousSort = undefined
    }

    filters.value.searchQuery = query
  }

  /**
   * Toggle source filter
   */
  const toggleSource = (source: string) => {
    filters.value.sources = filters.value.sources.includes(source)
      ? filters.value.sources.filter(s => s !== source)
      : [...filters.value.sources, source]
  }

  /**
   * Set minimum rating
   */
  const setMinRating = (rating: number) => {
    filters.value.minRating = rating
  }

  /**
   * Set minimum year
   */
  const setMinYear = (year: number) => {
    filters.value.minYear = year
  }

  /**
   * Set maximum year
   */
  const setMaxYear = (year: number) => {
    filters.value.maxYear = year
  }

  /**
   * Set minimum votes
   */
  const setMinVotes = (votes: number) => {
    filters.value.minVotes = votes
  }

  /**
   * Set maximum votes
   */
  const setMaxVotes = (votes: number) => {
    filters.value.maxVotes = votes
  }

  /**
   * Toggle genre filter
   */
  const toggleGenre = (genre: string) => {
    filters.value.genres = filters.value.genres.includes(genre)
      ? filters.value.genres.filter(g => g !== genre)
      : [...filters.value.genres, genre]
  }

  /**
   * Toggle country filter
   */
  const toggleCountry = (country: string) => {
    filters.value.countries = filters.value.countries.includes(country)
      ? filters.value.countries.filter(c => c !== country)
      : [...filters.value.countries, country]
  }

  /**
   * Reset all filters to defaults
   */
  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
  }

  // ============================================
  // PAGINATION ACTIONS
  // ============================================

  /**
   * Set current page for pagination
   */
  const setCurrentPage = (page: number) => {
    filters.value.currentPage = page
  }

  /**
   * Set last scroll position
   */
  const setScrollY = (y: number) => {
    filters.value.lastScrollY = y
  }

  // ============================================
  // LIKES ACTIONS
  // ============================================

  /**
   * Toggle like status for a movie
   */
  const toggleLike = (movieId: string) => {
    const index = likedMovieIds.value.indexOf(movieId)
    if (index > -1) {
      // Remove from likes
      likedMovieIds.value.splice(index, 1)
    } else {
      // Add to likes
      likedMovieIds.value.push(movieId)
    }
  }

  /**
   * Add a movie to likes
   */
  const like = (movieId: string) => {
    if (!likedMovieIds.value.includes(movieId)) {
      likedMovieIds.value.push(movieId)
    }
  }

  /**
   * Check if a movie is liked
   */
  const isLiked = (movieId: string): boolean => {
    return likedMovieIds.value.includes(movieId)
  }

  // ============================================
  // UTILITY ACTIONS
  // ============================================

  /**
   * Get the primary source for a movie
   */
  const getPrimarySource = (movie: MovieEntry): MovieSource | undefined => {
    if (movie.sources.length === 0) return undefined

    const archiveSources = movie.sources.filter((s: MovieSource) => s.type === 'archive.org')
    if (archiveSources.length > 0) {
      const sorted = [...archiveSources].sort((a: MovieSource, b: MovieSource) => {
        const aDownloads = 'downloads' in a ? a.downloads || 0 : 0
        const bDownloads = 'downloads' in b ? b.downloads || 0 : 0
        return bDownloads - aDownloads
      })
      return sorted[0]
    }

    return movie.sources[0]
  }

  /**
   * Check if a local poster exists
   */
  const posterExists = async (imdbId: string): Promise<boolean> => {
    if (!imdbId) return false

    if (posterCache.value.has(imdbId)) {
      return posterCache.value.get(imdbId)!
    }

    try {
      const response = await fetch(getPosterPath(imdbId), { method: 'HEAD' })
      const exists = response.ok
      posterCache.value.set(imdbId, exists)
      return exists
    } catch {
      posterCache.value.set(imdbId, false)
      return false
    }
  }

  /**
   * Get the best available poster URL
   */
  const getPosterUrl = async (movie: MovieEntry): Promise<string> => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    const hasLocal = await posterExists(movie.imdbId)
    if (hasLocal) {
      return getPosterPath(movie.imdbId)
    }

    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    return placeholder
  }

  /**
   * Get poster URL synchronously
   */
  const getPosterUrlSync = (movie: MovieEntry, preferLocal: boolean = true): string => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    if (preferLocal) {
      return getPosterPath(movie.imdbId)
    }

    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    return placeholder
  }

  // ============================================
  // WATCHERS
  // ============================================

  // Watch for filter changes and fetch
  watch(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currentPage, lastScrollY, ...rest } = filters.value
      return JSON.stringify(rest)
    },
    () => {
      // Only apply filters on the search page
      if (useRoute().path !== '/search') return

      filters.value.currentPage = 1
      // Fetch count first for immediate feedback
      fetchMovieCount()
      // Then fetch first page of movies
      fetchLightweightMovies({ limit: 50 })
    }
  )

  // Watch for page changes
  watch(
    () => filters.value.currentPage,
    (newPage, oldPage) => {
      // Only apply pagination on the search page
      if (useRoute().path !== '/search') return

      if (newPage > oldPage) {
        const itemsPerPage = 50
        const offset = (newPage - 1) * itemsPerPage

        // If we have source filters or search query, use fetchFilteredMovies
        if (
          filters.value.sources.length > 0 ||
          (filters.value.sort.field === 'relevance' && filters.value.searchQuery)
        ) {
          fetchFilteredMovies(true)
        } else {
          // Otherwise use fetchLightweightMovies with pagination
          fetchLightweightMovies({
            limit: itemsPerPage,
            offset,
          })
        }
      }
    }
  )

  // Initial fetch when DB is ready
  watch(
    () => db.isReady.value,
    ready => {
      // Only perform initial fetch on the search page
      if (useRoute().path !== '/search') return

      const currentLength = lightweightMovies.value?.length || 0
      if (ready && currentLength === 0) {
        fetchMovieCount()
        fetchLightweightMovies({ limit: 50 })
      }
    },
    { immediate: true }
  )

  // ============================================
  // RETURN STORE API
  // ============================================

  return {
    // ============================================
    // STATE (Read-only refs)
    // ============================================
    allMovies: readonly(allMovies),
    movieDetailsCache: readonly(movieDetailsCache),
    filters: readonly(filters),
    isInitialLoading: readonly(isInitialLoading),
    isFiltering: readonly(isFiltering),
    isLoading: readonly(isLoading),
    likedMovieIds: readonly(likedMovieIds),

    // ============================================
    // COMPUTED PROPERTIES
    // ============================================

    // Data views
    filteredAndSortedMovies: readonly(filteredAndSortedMovies),
    lightweightMovies: readonly(lightweightMovies),
    currentMovieList,

    // Statistics
    totalMovies,
    totalFiltered: readonly(totalFiltered),
    likedCount,
    activeFiltersCount,
    hasActiveFilters,
    currentSortOption,

    // ============================================
    // ACTIONS - Data Loading
    // ============================================
    loadFromFile,
    fetchMovieCount,
    fetchMovies,
    fetchMoviesByIds,
    getMovieById,
    getRelatedMovies,
    searchMovies,
    mapRowToMovie,

    // ============================================
    // ACTIONS - Filtering & Sorting
    // ============================================
    setSort,
    setSearchQuery,
    toggleSource,
    setMinRating,
    setMinYear,
    setMaxYear,
    setMinVotes,
    setMaxVotes,
    toggleGenre,
    toggleCountry,
    resetFilters,
    applyFilters,
    fetchFilteredMovies,
    fetchLightweightMovies,

    // ============================================
    // ACTIONS - Pagination
    // ============================================
    setCurrentPage,
    setScrollY,

    // ============================================
    // ACTIONS - Likes
    // ============================================
    toggleLike,
    like,
    isLiked,

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    getPrimarySource,
    posterExists,
    getPosterUrl,
    getPosterUrlSync,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMovieStore, import.meta.hot))
}
