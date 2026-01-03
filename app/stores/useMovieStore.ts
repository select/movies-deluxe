import type { MovieEntry, MovieSource, LightweightMovieEntry, QualityLabel } from '~/types'
import type { LightweightMovie } from '~/types/database'
import { useStorage } from '@vueuse/core'

/**
 * Movie Store
 * Manages movie data, filtering, sorting, and user interactions
 * Uses SQLite WASM for efficient querying and VueUse for persistent storage
 */

/**
 * Serializable sort state (for localStorage)
 */
export interface SortState {
  field: SortField
  direction: SortDirection
}

/**
 * Filter state interface
 */
export interface FilterState {
  // Sorting (stored as field + direction for localStorage compatibility)
  sort: SortState

  // Remember previous sort when searching
  previousSort?: SortState

  // Source filter (can be 'archive.org' or YouTube channel names)
  sources: string[]

  // Rating filter
  minRating: number

  // Year filter
  minYear: number

  // Votes filter
  minVotes: number

  // Genre filter
  genres: string[]

  // Country filter
  countries: string[]

  // Search query
  searchQuery: string

  // Pagination
  currentPage: number
  lastScrollY: number
}

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
  minVotes: 0,
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
  const mapRowToMovie = (row: Record<string, unknown>): MovieEntry => {
    return {
      imdbId: row.imdbId as string,
      title: row.title as string,
      year: row.year as number,
      lastUpdated: row.lastUpdated as string,
      sources: [], // Sources will be loaded from JSON files when needed
      metadata: {
        imdbRating: (row.imdbRating as number | undefined)?.toString(),
        imdbVotes: (row.imdbVotes as number | undefined)?.toLocaleString(),
        imdbID: row.imdbId as string,
        Genre: row.genre as string | undefined,
        Language: row.language as string | undefined,
        Country: row.country as string | undefined,
      },
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
      await db.init('/data/movies.db')

      isInitialLoading.value = false
    } catch (err) {
      window.console.error('Failed to initialize SQLite:', err)
      // Fallback to JSON API if SQLite fails
      await loadFromApi()
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Load movies from JSON API (fallback or admin interface)
   */
  const loadFromApi = async () => {
    isLoading.value.movies = true
    try {
      const response = await $fetch<Record<string, unknown>>('/api/movies')

      if (response.error) {
        window.console.error('Failed to load movies from JSON:', response.message)
        return
      }

      const movieEntries: MovieEntry[] = Object.entries(response)
        .filter(([key]) => !key.startsWith('_'))
        .filter(([, value]) => {
          if (!value || typeof value !== 'object' || !('imdbId' in value) || !('title' in value)) {
            return false
          }
          const movie = value as Record<string, unknown>
          if (typeof movie.imdbId !== 'string') return false
          if (typeof movie.title === 'string') return true
          if (Array.isArray(movie.title)) {
            return movie.title.every((t: unknown) => typeof t === 'string')
          }
          return false
        })
        .map(([, value]) => value as MovieEntry)

      // Convert array to Map
      allMovies.value.clear()
      movieEntries.forEach(movie => {
        allMovies.value.set(movie.imdbId, movie)
      })
    } catch (err) {
      window.console.error('Failed to load movies from JSON fallback:', err)
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Fetch movies from database (lightweight version)
   */
  const fetchMovies = async (options: {
    where?: string
    params?: unknown[]
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
      const results = await db.queryByIds<Record<string, unknown>>(uncachedIds)
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
    // Check cache first - but only if it has sources loaded
    if (movieDetailsCache.value.has(imdbId)) {
      const cached = movieDetailsCache.value.get(imdbId)
      if (cached && cached.sources && cached.sources.length > 0) {
        return cached
      }
    }

    // Check allMovies - if it has sources, it's a full entry
    if (allMovies.value.has(imdbId)) {
      const movie = allMovies.value.get(imdbId)
      if (movie && movie.sources && movie.sources.length > 0) {
        return movie
      }
    }

    // Fetch full details from JSON file (static deployment)
    isLoading.value.movieDetails = true
    try {
      const movie = await $fetch<MovieEntry>(`/movies/${imdbId}.json`)
      // Validate that we got a proper movie object (not HTML or malformed data)
      if (movie && typeof movie === 'object' && movie.imdbId && movie.title) {
        movieDetailsCache.value.set(imdbId, movie)
        return movie
      }
      // If we got invalid data, treat it as not found
      console.warn(`[MovieStore] Invalid movie data for ${imdbId}`)
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
      // Fetch movie details directly from JSON file to get related movie IDs
      const movie = await $fetch<MovieEntry>(`/movies/${movieId}.json`)

      if (!movie || !movie.relatedMovies || movie.relatedMovies.length === 0) {
        return []
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
      const results = await db.query<Record<string, unknown>>(
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
  const fetchLightweightMovies = async () => {
    if (!db.isReady.value) {
      window.console.log('DB not ready, cannot fetch lightweight movies')
      return
    }

    isFiltering.value = true
    try {
      const params: unknown[] = []
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
      if (filters.value.minVotes > 0) {
        where.push('m.imdbVotes >= ?')
        params.push(filters.value.minVotes)
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
        await fetchFilteredMovies()
        return
      }

      // Sorting
      let orderBy = ''
      const sortField = filters.value.sort.field
      const sortDir = filters.value.sort.direction.toUpperCase()

      if (sortField === 'relevance' && filters.value.searchQuery) {
        // For search, we need to use FTS which requires full query
        await fetchFilteredMovies()
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
        includeCount: true,
      })

      lightweightMovies.value = result || []
      if (totalCount !== undefined) {
        totalFiltered.value = totalCount
      }
    } catch (err: unknown) {
      window.window.console.error('[MovieStore] Lightweight query failed:', err)
      lightweightMovies.value = []
    } finally {
      isFiltering.value = false
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
      const params: unknown[] = []
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
      if (filters.value.minVotes > 0) {
        where.push('m.imdbVotes >= ?')
        params.push(filters.value.minVotes)
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

    // 0. Filter by quality (exclude marked movies by default)
    filtered = getQualityFilteredMovies(filtered)

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

    // 3. Filter by minimum year
    if (filters.value.minYear > 0) {
      filtered = filtered.filter(movie => {
        return (movie.year || 0) >= filters.value.minYear
      })
    }

    // 4. Filter by minimum votes
    if (filters.value.minVotes > 0) {
      filtered = filtered.filter(movie => {
        const votesStr = movie.metadata?.imdbVotes
        const votes =
          typeof votesStr === 'number'
            ? votesStr
            : parseInt(String(votesStr || '0').replace(/,/g, ''))
        return votes >= filters.value.minVotes
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
  const setSort = (option: SortOption) => {
    filters.value.sort = { field: option.field, direction: option.direction }

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
   * Set minimum votes
   */
  const setMinVotes = (votes: number) => {
    filters.value.minVotes = votes
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
   * Get the best available poster URL
   */
  const getPosterUrl = async (movie: MovieEntry): Promise<string> => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    const hasLocal = await posterExists(movie.imdbId)
    if (hasLocal) {
      return `/posters/${movie.imdbId}.jpg`
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
      return `/posters/${movie.imdbId}.jpg`
    }

    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    return placeholder
  }

  /**
   * Mark movie quality with labels and notes
   */
  const markMovieQuality = async (
    movieId: string,
    labels: QualityLabel[],
    notes?: string,
    markedBy: string = 'admin'
  ) => {
    try {
      const response = await $fetch<{ success: boolean; movieId: string }>(
        '/api/admin/movie/update',
        {
          method: 'POST',
          body: {
            movieId,
            qualityLabels: labels,
            qualityNotes: notes,
            qualityMarkedBy: markedBy,
          },
        }
      )

      if (response.success) {
        // Update local state in allMovies and movieDetailsCache
        const updateMovie = (movie: MovieEntry) => {
          movie.qualityLabels = labels
          movie.qualityNotes = notes
          movie.qualityMarkedBy = markedBy
          movie.qualityMarkedAt = new Date().toISOString()
          movie.lastUpdated = new Date().toISOString()
        }

        const movie = allMovies.value.get(movieId)
        if (movie) updateMovie(movie)

        const cachedMovie = movieDetailsCache.value.get(movieId)
        if (cachedMovie) updateMovie(cachedMovie)

        return true
      }
      return false
    } catch (err) {
      window.console.error('[MovieStore] Failed to mark movie quality:', err)
      return false
    }
  }

  /**
   * Clear quality markings from a movie
   */
  const clearMovieQuality = async (movieId: string) => {
    try {
      const response = await $fetch<{ success: boolean; movieId: string }>(
        '/api/admin/movie/update',
        {
          method: 'POST',
          body: {
            movieId,
            qualityLabels: [],
          },
        }
      )

      if (response.success) {
        // Update local state
        const clearMovie = (movie: MovieEntry) => {
          delete movie.qualityLabels
          delete movie.qualityNotes
          delete movie.qualityMarkedBy
          delete movie.qualityMarkedAt
          movie.lastUpdated = new Date().toISOString()
        }

        const movie = allMovies.value.get(movieId)
        if (movie) clearMovie(movie)

        const cachedMovie = movieDetailsCache.value.get(movieId)
        if (cachedMovie) clearMovie(cachedMovie)

        return true
      }
      return false
    } catch (err) {
      window.console.error('[MovieStore] Failed to clear movie quality:', err)
      return false
    }
  }

  /**
   * Get all movies that have quality markings
   */
  const getMarkedMovies = (): MovieEntry[] => {
    return Array.from(allMovies.value.values()).filter(
      (movie: MovieEntry) => (movie.qualityLabels?.length || 0) > 0
    )
  }

  /**
   * Get movies filtered by quality (exclude marked ones by default)
   */
  const getQualityFilteredMovies = (movies: MovieEntry[]): MovieEntry[] => {
    return movies.filter((movie: MovieEntry) => (movie.qualityLabels?.length || 0) === 0)
  }

  // ============================================
  // WATCHERS
  // ============================================

  // Throttled search query for performance
  const throttledSearchQuery = refThrottled(
    computed(() => filters.value.searchQuery),
    500
  )

  // Watch for filter changes and fetch
  watch(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currentPage, lastScrollY, searchQuery, ...rest } = filters.value
      return JSON.stringify({ ...rest, searchQuery: throttledSearchQuery.value })
    },
    () => {
      filters.value.currentPage = 1
      fetchLightweightMovies()
    }
  )

  // Watch for page changes
  watch(
    () => filters.value.currentPage,
    (newPage, oldPage) => {
      if (newPage > oldPage) {
        fetchFilteredMovies(true)
      }
    }
  )

  // Initial fetch when DB is ready
  watch(
    () => db.isReady.value,
    ready => {
      console.log('[MovieStore] Watch triggered - DB ready:', ready)
      const currentLength = lightweightMovies.value?.length || 0
      console.log('[MovieStore] lightweightMovies.value.length:', currentLength)
      if (ready && currentLength === 0) {
        console.log('[MovieStore] DB is ready, fetching lightweight movies...')
        fetchLightweightMovies()
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
    loadFromApi,
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
    setMinVotes,
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
    markMovieQuality,
    clearMovieQuality,
    getMarkedMovies,
    getQualityFilteredMovies,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMovieStore, import.meta.hot))
}
