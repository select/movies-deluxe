import type {
  MovieEntry,
  MovieSource,
  MovieSourceType,
  MovieMetadata,
  LightweightMovieEntry,
} from '~/types'
import {
  SORT_OPTIONS,
  sortMovies,
  type SortOption,
  type SortField,
  type SortDirection,
} from '~/utils/movieSort'
import { useStorage } from '@vueuse/core'

/**
 * Extended MovieEntry with user metadata
 * User-specific data (likes) is stored separately in VueUse storage
 * Type alias kept for backwards compatibility
 */
export type ExtendedMovieEntry = MovieEntry

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

  // Localhost-only filters
  showMissingMetadataOnly: boolean

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
  showMissingMetadataOnly: false,
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
 * - Single Map<string, ExtendedMovieEntry> for all movies (O(1) lookups)
 * - Computed properties for filtered views (no duplicate arrays)
 * - Embedded like/watchlist metadata in movie objects
 * - Reactive filters with automatic recomputation
 * - localStorage persistence for user data and filters
 */
export const useMovieStore = defineStore('movie', () => {
  console.log('[MovieStore] Initializing unified movie store')

  // ============================================
  // STATE
  // ============================================

  // Single source of truth - all movies stored here
  // Use shallowRef to avoid deep reactivity on movie objects (performance optimization)
  const allMovies = shallowRef<Map<string, ExtendedMovieEntry>>(new Map())

  // Cache for movie details
  // Use shallowRef to avoid deep reactivity on movie objects (performance optimization)
  const movieDetailsCache = shallowRef<Map<string, ExtendedMovieEntry>>(new Map())

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
   * Filtered and sorted movies based on current filters
   * This is the primary computed property that applies all filters
   */
  const filteredAndSortedMovies = ref<ExtendedMovieEntry[]>([])

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
   * Map SQL row to ExtendedMovieEntry
   */
  const mapRowToMovie = (row: Record<string, unknown>): ExtendedMovieEntry => {
    const sourcesRaw = (row.sources_raw as string) || ''
    const sources: MovieSource[] = sourcesRaw
      ? sourcesRaw
          .split('###')
          .filter((s: string) => s.trim())
          .map((s: string) => {
            const [type, id, title, label, quality, addedAt, description, channelName] =
              s.split('|||')
            if (!type || !id) return null

            const base = {
              type: type as MovieSourceType,
              url: generateSourceUrl(type as MovieSourceType, id),
              id,
              title: title || '',
              label: label || undefined,
              quality: quality || undefined,
              addedAt: addedAt || new Date().toISOString(),
              description: description || undefined,
            }

            if (type === 'youtube') {
              return {
                ...base,
                type: 'youtube' as const,
                channelName: channelName || '',
              } as YouTubeSource
            }
            return base as ArchiveOrgSource
          })
          .filter((s: MovieSource | null): s is MovieSource => s !== null)
      : []

    const metadata: MovieMetadata | undefined = row.is_curated
      ? {
          Rated: row.rated as string | undefined,
          Runtime: row.runtime as string | undefined,
          Genre: row.genre as string | undefined,
          Director: row.director as string | undefined,
          Writer: row.writer as string | undefined,
          Actors: row.actors as string | undefined,
          Plot: row.plot as string | undefined,
          Language: row.language as string | undefined,
          Country: row.country as string | undefined,
          Awards: row.awards as string | undefined,
          imdbRating: (row.imdbRating as number | undefined)?.toString(),
          imdbVotes: (row.imdbVotes as number | undefined)?.toLocaleString(),
          imdbID: row.imdbId as string,
        }
      : undefined

    return {
      imdbId: row.imdbId as string,
      title: row.title as string,
      year: row.year as number,
      verified: !!row.verified,
      lastUpdated: row.lastUpdated as string,
      sources,
      metadata,
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
      console.error('Failed to initialize SQLite:', err)
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
        console.error('Failed to load movies from JSON:', response.message)
        return
      }

      const movieEntries: ExtendedMovieEntry[] = Object.entries(response)
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
        .map(([, value]) => value as ExtendedMovieEntry)

      // Convert array to Map
      allMovies.value.clear()
      movieEntries.forEach(movie => {
        allMovies.value.set(movie.imdbId, movie)
      })
    } catch (err) {
      console.error('Failed to load movies from JSON fallback:', err)
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Fetch movies with filtering and pagination from SQLite
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

    let from = 'movies m'
    let finalWhere = where || ''

    if (searchQuery?.trim()) {
      from = 'fts_movies f JOIN movies m ON f.imdbId = m.imdbId'
      const searchWhere = 'fts_movies MATCH ?'
      finalWhere = finalWhere ? `(${finalWhere}) AND (${searchWhere})` : searchWhere

      // Sanitize search query for FTS5
      const sanitizedQuery = searchQuery.replace(/"/g, '""').trim()
      params.push(`"${sanitizedQuery}"`)
    }

    const { result, totalCount } = await db.extendedQuery<Record<string, unknown>>({
      select: `m.*,
               ${
                 searchQuery?.trim()
                   ? `CASE
                  WHEN m.title LIKE '%${searchQuery.replace(/'/g, "''")}%' THEN 1
                  ELSE 2
                END as title_priority,`
                   : ''
               }
               GROUP_CONCAT(s.type || '|||' || COALESCE(s.identifier, '') || '|||' || COALESCE(s.title, '') || '|||' || COALESCE(s.label, '') || '|||' || COALESCE(s.quality, '') || '|||' || s.addedAt || '|||' || COALESCE(s.description, '') || '|||' || COALESCE(c.name, ''), '###') as sources_raw`,
      from: `${from} LEFT JOIN sources s ON m.imdbId = s.movieId LEFT JOIN channels c ON s.channelId = c.id`,
      where: finalWhere,
      params,
      groupBy: 'm.imdbId',
      orderBy: searchQuery?.trim()
        ? `title_priority ASC, rank ASC, m.imdbId`
        : orderBy
          ? `${orderBy}, m.imdbId`
          : 'm.imdbId',
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
  const fetchMoviesByIds = async (imdbIds: string[]): Promise<ExtendedMovieEntry[]> => {
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
      console.error('[MovieStore] Failed to fetch movies by IDs:', err)
      return []
    }
  }

  /**
   * Get a single movie by ID (from cache or database)
   */
  const getMovieById = async (imdbId: string): Promise<ExtendedMovieEntry | undefined> => {
    // Check allMovies first
    if (allMovies.value.has(imdbId)) {
      return allMovies.value.get(imdbId)
    }

    // Check cache
    if (movieDetailsCache.value.has(imdbId)) {
      return movieDetailsCache.value.get(imdbId)
    }

    // Fetch from database
    const movies = await fetchMoviesByIds([imdbId])
    return movies[0]
  }

  /**
   * Get related movies for a given movie ID
   */
  const getRelatedMovies = async (
    movieId: string,
    limit: number = 8
  ): Promise<ExtendedMovieEntry[]> => {
    try {
      // Fetch related movie IDs and basic info from database
      const relatedRows = await db.getRelatedMovies<{
        imdbId: string
        title: string
        year: number
        score: number
      }>(movieId, limit)

      if (!relatedRows || relatedRows.length === 0) {
        return []
      }

      // Fetch full movie data for each related movie
      const relatedMovieIds = relatedRows.map(row => row.imdbId)
      const fullMovies = await db.queryByIds<Record<string, unknown>>(relatedMovieIds)

      // Map to MovieEntry objects
      const movies = fullMovies.map(mapRowToMovie)

      // Sort by original score order (preserve database ordering)
      const scoreMap = new Map(
        relatedRows.map(row => {
          return [row.imdbId, row.score]
        })
      )
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
   * Search movies using FTS5 full-text search
   */
  const searchMovies = async (searchQuery: string): Promise<ExtendedMovieEntry[]> => {
    if (!searchQuery || !searchQuery.trim()) {
      return Array.from(allMovies.value.values())
    }

    if (!db.isReady.value) {
      // Fallback to simple JS search if DB is not ready
      const lowerQuery = searchQuery.toLowerCase()
      return Array.from(allMovies.value.values()).filter((movie: ExtendedMovieEntry) => {
        const titles = Array.isArray(movie.title) ? movie.title : [movie.title]
        return titles.some((t: string) => t.toLowerCase().includes(lowerQuery))
      })
    }

    try {
      const sanitizedQuery = searchQuery.replace(/"/g, '""').trim()
      const results = await db.query<Record<string, unknown>>(
        `
        SELECT m.imdbId,
               CASE
                 WHEN m.title LIKE ? THEN 3
                 WHEN m.title LIKE ? THEN 2
                 ELSE 1
               END as relevance_score
        FROM fts_movies f
        JOIN movies m ON f.imdbId = m.imdbId
        WHERE fts_movies MATCH ?
        ORDER BY relevance_score DESC, rank
      `,
        [`%${sanitizedQuery}%`, `%${sanitizedQuery.toLowerCase()}%`, `"${sanitizedQuery}"`]
      )

      const matchedIds = new Set(results.map(r => r.imdbId as string))
      return Array.from(allMovies.value.values()).filter(m => matchedIds.has(m.imdbId))
    } catch (err) {
      console.error('[MovieStore] Search failed:', err)
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
      if (filters.value.showMissingMetadataOnly) {
        where.push('m.is_curated = 0')
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
      window.console.error('[MovieStore] Lightweight query failed:', err)
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
      window.console.error('DB not ready, using JS filtering')
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
      if (filters.value.showMissingMetadataOnly) {
        where.push('m.is_curated = 0')
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

      if (sortField === 'relevance' && filters.value.searchQuery) {
        orderBy = `rank ${sortDir}`
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
      window.console.error('[MovieStore] SQL filtering failed:', err)
      filteredAndSortedMovies.value = []
    } finally {
      isFiltering.value = false
    }
  }

  /**
   * Apply all filters to a list of movies (for JS fallback or liked.vue)
   */
  const applyFilters = (movies: ExtendedMovieEntry[]): ExtendedMovieEntry[] => {
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

    // 3. Filter by minimum year
    if (filters.value.minYear > 0) {
      filtered = filtered.filter(movie => {
        return (movie.year || 0) >= filters.value.minYear
      })
    }

    // 4. Filter by minimum votes
    if (filters.value.minVotes > 0) {
      filtered = filtered.filter(movie => {
        const votes = parseInt(movie.metadata?.imdbVotes?.replace(/,/g, '') || '0')
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

    // 7. Filter by missing metadata
    if (filters.value.showMissingMetadataOnly) {
      filtered = filtered.filter(movie => !movie.metadata || !movie.metadata.imdbID)
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
   * Toggle missing metadata filter
   */
  const toggleMissingMetadata = () => {
    filters.value.showMissingMetadataOnly = !filters.value.showMissingMetadataOnly
  }

  /**
   * Reset all filters to defaults
   */
  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
  }

  /**
   * Get all unique genres from movies
   */
  const getAvailableGenres = (movies: ExtendedMovieEntry[]): string[] => {
    const genresSet = new Set<string>()
    movies.forEach(movie => {
      movie.metadata?.Genre?.split(', ').forEach((genre: string) => {
        genresSet.add(genre.trim())
      })
    })
    return Array.from(genresSet).sort()
  }

  /**
   * Get all unique countries from movies
   */
  const getAvailableCountries = (movies: ExtendedMovieEntry[]): string[] => {
    const countriesSet = new Set<string>()
    movies.forEach(movie => {
      movie.metadata?.Country?.split(', ').forEach((country: string) => {
        countriesSet.add(country.trim())
      })
    })
    return Array.from(countriesSet).sort()
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
   * Load more movies (increment page)
   */
  const loadMoreMovies = () => {
    filters.value.currentPage++
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
   * Remove a movie from likes
   */
  const unlike = (movieId: string) => {
    const index = likedMovieIds.value.indexOf(movieId)
    if (index > -1) {
      likedMovieIds.value.splice(index, 1)
    }
  }

  /**
   * Check if a movie is liked
   */
  const isLiked = (movieId: string): boolean => {
    return likedMovieIds.value.includes(movieId)
  }

  /**
   * Clear all liked movies
   */
  const clearLikes = () => {
    likedMovieIds.value = []
  }

  // ============================================
  // UTILITY ACTIONS
  // ============================================

  /**
   * Filter movies by source type
   */
  const filterBySource = (sourceType: MovieSourceType): ExtendedMovieEntry[] => {
    return Array.from(allMovies.value.values()).filter((movie: ExtendedMovieEntry) =>
      movie.sources.some((source: MovieSource) => source.type === sourceType)
    )
  }

  /**
   * Get movies that have OMDB metadata
   */
  const getEnrichedMovies = (): ExtendedMovieEntry[] => {
    return Array.from(allMovies.value.values()).filter(
      (movie: ExtendedMovieEntry) => movie.metadata !== undefined
    )
  }

  /**
   * Get movies without OMDB metadata
   */
  const getUnenrichedMovies = (): ExtendedMovieEntry[] => {
    return Array.from(allMovies.value.values()).filter(
      (movie: ExtendedMovieEntry) => movie.metadata === undefined
    )
  }

  /**
   * Get all sources for a movie grouped by type
   */
  const getSourcesByType = (movie: ExtendedMovieEntry): Record<MovieSourceType, MovieSource[]> => {
    return movie.sources.reduce(
      (grouped: Record<MovieSourceType, MovieSource[]>, source: MovieSource) => {
        if (!grouped[source.type]) {
          grouped[source.type] = []
        }
        grouped[source.type]!.push(source)
        return grouped
      },
      {
        'archive.org': [],
        youtube: [],
      } as Record<MovieSourceType, MovieSource[]>
    )
  }

  /**
   * Get the primary source for a movie
   */
  const getPrimarySource = (movie: ExtendedMovieEntry): MovieSource | undefined => {
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
  const getPosterUrl = async (movie: ExtendedMovieEntry): Promise<string> => {
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
  const getPosterUrlSync = (movie: ExtendedMovieEntry, preferLocal: boolean = true): string => {
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
   * Preload posters for multiple movies
   */
  const preloadPosters = async (imdbIds: string[]): Promise<Map<string, boolean>> => {
    const results = new Map<string, boolean>()

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
   * Runtime OMDB enrichment
   */
  const enrichMovieMetadata = async (movie: ExtendedMovieEntry) => {
    isLoading.value.imdbFetch = true

    const apiKey = useRuntimeConfig().public.OMDB_API_KEY
    if (!apiKey) {
      isLoading.value.imdbFetch = false
      return null
    }

    try {
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

      // Update the movie in allMovies
      const existingMovie = allMovies.value.get(movie.imdbId)
      if (existingMovie) {
        existingMovie.metadata = metadata
      }

      isLoading.value.imdbFetch = false
      return metadata
    } catch {
      isLoading.value.imdbFetch = false
      return null
    }
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

  // Reload filters from localStorage on mount
  if (typeof window !== 'undefined') {
    onMounted(() => {
      const stored = localStorage.getItem('movies-deluxe-filters')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          const merged = { ...DEFAULT_FILTERS, ...parsed }
          if (JSON.stringify(filters.value) !== JSON.stringify(merged)) {
            filters.value = merged
          }
        } catch {
          // Failed to reload from localStorage
        }
      }
    })
  }

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
    toggleMissingMetadata,
    resetFilters,
    applyFilters,
    getAvailableGenres,
    getAvailableCountries,
    fetchFilteredMovies,
    fetchLightweightMovies,

    // ============================================
    // ACTIONS - Pagination
    // ============================================
    setCurrentPage,
    loadMoreMovies,
    setScrollY,

    // ============================================
    // ACTIONS - Likes
    // ============================================
    toggleLike,
    like,
    unlike,
    isLiked,
    clearLikes,

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    filterBySource,
    getEnrichedMovies,
    getUnenrichedMovies,
    getSourcesByType,
    getPrimarySource,
    posterExists,
    getPosterUrl,
    getPosterUrlSync,
    preloadPosters,
    enrichMovieMetadata,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMovieStore, import.meta.hot))
}
