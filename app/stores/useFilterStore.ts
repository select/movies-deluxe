import type { MovieEntry, LightweightMovieEntry } from '~/types'
import {
  SORT_OPTIONS,
  sortMovies,
  type SortOption,
  type SortField,
  type SortDirection,
} from '~/utils/movieSort'

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
 * Filter store with persistent state
 */
export const useFilterStore = defineStore('filter', () => {
  console.log('[FilterStore] Initializing filter store')

  // Initialize from localStorage (client-side only)
  const getInitialFilters = (): FilterState => {
    if (typeof window === 'undefined') {
      return DEFAULT_FILTERS
    }

    try {
      const stored = localStorage.getItem('movies-deluxe-filters')
      if (stored) {
        return {
          ...DEFAULT_FILTERS,
          ...JSON.parse(stored),
        }
      }
    } catch {
      // Failed to parse localStorage
    }

    return DEFAULT_FILTERS
  }

  // Reactive state
  const filters = ref<FilterState>(getInitialFilters())
  const filteredMovies = ref<MovieEntry[]>([])
  const lightweightMovies = ref<LightweightMovieEntry[]>([])
  const totalMovies = ref(0)
  const isFiltering = ref(false)

  const movieStore = useMovieStore()
  const db = useDatabase()

  /**
   * Fetch lightweight movie list (IDs and titles only) for virtual scrolling
   */
  const fetchLightweightMovies = async () => {
    if (!db.isReady.value) {
      console.log('DB not ready, cannot fetch lightweight movies')
      return
    }

    console.log('[FilterStore] Fetching lightweight movies...')
    isFiltering.value = true
    try {
      const params: any[] = []
      const where: string[] = []

      // Apply filters (same as full query but without joins)
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

      console.log(
        '[FilterStore] Lightweight query returned:',
        result?.length || 0,
        'movies, total:',
        totalCount
      )

      lightweightMovies.value = result || []
      if (totalCount !== undefined) {
        totalMovies.value = totalCount
      }
    } catch (err: any) {
      window.console.error('[FilterStore] Lightweight query failed:', err)
      if (err.message) window.console.error('Error message:', err.message)
      if (err.stack) window.console.error('Stack:', err.stack)
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
      console.log('DB not ready, using JS filtering')
      const allMovies = await movieStore.searchMovies(filters.value.searchQuery)
      filteredMovies.value = applyFilters(allMovies)
      totalMovies.value = filteredMovies.value.length
      return
    }

    console.log('Fetching filtered movies from SQLite...')
    isFiltering.value = true
    try {
      const params: any[] = []
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

      const itemsPerPage = 20
      const limit = filters.value.currentPage * itemsPerPage
      const offset = append ? (filters.value.currentPage - 1) * itemsPerPage : 0

      const { result, totalCount } = await movieStore.fetchMovies({
        searchQuery: filters.value.searchQuery,
        where: where.join(' AND '),
        params,
        orderBy,
        limit: append ? itemsPerPage : limit,
        offset,
        includeCount: true,
      })

      console.log(
        '[FilterStore] fetchMovies returned:',
        result.length,
        'movies, total:',
        totalCount
      )

      if (append) {
        filteredMovies.value = [...filteredMovies.value, ...result]
      } else {
        filteredMovies.value = result
        // Also populate lightweight movies for virtual scrolling
        lightweightMovies.value = result.map(m => ({
          imdbId: m.imdbId,
          title: m.title,
          year: m.year,
        }))
      }

      console.log('[FilterStore] filteredMovies.value length:', filteredMovies.value.length)

      if (totalCount !== undefined) {
        totalMovies.value = totalCount
      }
    } catch (err: any) {
      window.console.error('[FilterStore] SQL filtering failed:', err)
      if (err.message) window.console.error('Error message:', err.message)
      filteredMovies.value = []
    } finally {
      isFiltering.value = false
    }
  }

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
      console.log('[FilterStore] Filters changed, resetting page and fetching...')
      filters.value.currentPage = 1
      fetchLightweightMovies()
    }
  )

  // Watch for page changes
  watch(
    () => filters.value.currentPage,
    (newPage, oldPage) => {
      if (newPage > oldPage) {
        console.log('[FilterStore] Page increased, fetching more...')
        fetchFilteredMovies(true)
      }
    }
  )

  // Initial fetch when DB is ready
  watch(
    () => db.isReady.value,
    ready => {
      console.log('[FilterStore] Watch triggered - DB ready:', ready)
      const currentLength = lightweightMovies.value?.length || 0
      console.log('[FilterStore] lightweightMovies.value.length:', currentLength)
      if (ready && currentLength === 0) {
        console.log('[FilterStore] DB is ready, fetching lightweight movies...')
        fetchLightweightMovies()
      }
    },
    { immediate: true }
  )

  if (typeof window !== 'undefined') {
    onMounted(() => {
      const stored = localStorage.getItem('movies-deluxe-filters')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          const merged = { ...DEFAULT_FILTERS, ...parsed }
          // Only update if different from current state
          if (JSON.stringify(filters.value) !== JSON.stringify(merged)) {
            filters.value = merged
          }
        } catch {
          // Failed to reload from localStorage
        }
      }
    })
  }

  // Helper to persist to localStorage
  const persistFilters = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('movies-deluxe-filters', JSON.stringify(filters.value))
      } catch {
        // Failed to save to localStorage
      }
    }
  }

  /**
   * Set sort option
   */
  const setSort = (option: SortOption) => {
    filters.value.sort = { field: option.field, direction: option.direction }

    // If user manually sets sort while searching, clear previousSort
    // so we don't overwrite their manual choice when they clear search
    if (filters.value.searchQuery !== '') {
      filters.value.previousSort = undefined
    }

    persistFilters()
  }

  /**
   * Get current sort option (reconstructed from stored state)
   */
  const currentSortOption = computed((): SortOption => {
    // During SSR, filters might not be initialized yet
    if (!filters.value || !filters.value.sort) {
      return SORT_OPTIONS[0]!
    }

    const stored = filters.value.sort
    const found = SORT_OPTIONS.find(
      opt => opt.field === stored.field && opt.direction === stored.direction
    )
    return found || SORT_OPTIONS[0]!
  })

  /**
   * Set search query
   */
  const setSearchQuery = (query: string) => {
    const wasEmpty = filters.value.searchQuery === ''
    const isNowEmpty = query === ''

    if (wasEmpty && !isNowEmpty) {
      // Entering search: save current sort and switch to relevance
      filters.value.previousSort = { ...filters.value.sort }
      filters.value.sort = { field: 'relevance', direction: 'desc' }
    } else if (!wasEmpty && isNowEmpty && filters.value.previousSort) {
      // Clearing search: restore previous sort
      filters.value.sort = { ...filters.value.previousSort }
      filters.value.previousSort = undefined
    }

    filters.value.searchQuery = query
    persistFilters()
  }

  /**
   * Toggle source filter (archive.org or YouTube channel name)
   */
  const toggleSource = (source: string) => {
    filters.value.sources = filters.value.sources.includes(source)
      ? filters.value.sources.filter(s => s !== source)
      : [...filters.value.sources, source]
    persistFilters()
  }

  /**
   * Set minimum rating
   */
  const setMinRating = (rating: number) => {
    filters.value.minRating = rating
    persistFilters()
  }

  /**
   * Set minimum year
   */
  const setMinYear = (year: number) => {
    filters.value.minYear = year
    persistFilters()
  }

  /**
   * Set minimum votes
   */
  const setMinVotes = (votes: number) => {
    filters.value.minVotes = votes
    persistFilters()
  }

  /**
   * Toggle genre filter
   */
  const toggleGenre = (genre: string) => {
    filters.value.genres = filters.value.genres.includes(genre)
      ? filters.value.genres.filter(g => g !== genre)
      : [...filters.value.genres, genre]
    persistFilters()
  }

  /**
   * Toggle country filter
   */
  const toggleCountry = (country: string) => {
    filters.value.countries = filters.value.countries.includes(country)
      ? filters.value.countries.filter(c => c !== country)
      : [...filters.value.countries, country]
    persistFilters()
  }

  /**
   * Toggle missing metadata filter (localhost only)
   */
  const toggleMissingMetadata = () => {
    filters.value.showMissingMetadataOnly = !filters.value.showMissingMetadataOnly
    persistFilters()
  }

  /**
   * Set current page for pagination
   */
  const setCurrentPage = (page: number) => {
    filters.value.currentPage = page
    persistFilters()
  }

  /**
   * Set last scroll position
   */
  const setScrollY = (y: number) => {
    filters.value.lastScrollY = y
    persistFilters()
  }

  /**
   * Reset all filters to defaults
   */
  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
    persistFilters()
  }

  /**
   * Check if any filters are active (excluding sort)
   */
  const hasActiveFilters = computed(() => {
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
   * Apply all filters to a list of movies
   */
  const applyFilters = (movies: MovieEntry[]): MovieEntry[] => {
    let filtered = [...movies]

    // 1. Filter by source (archive.org or YouTube channel)
    if (filters.value.sources.length > 0) {
      filtered = filtered.filter(movie => {
        return movie.sources.some((source: MovieSource) => {
          // Check if Archive.org is selected
          if (source.type === 'archive.org') {
            return filters.value.sources.includes('archive.org')
          }

          // Check if YouTube channel is selected
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

    // 5. Filter by genres (any selected genre must be present)
    if (filters.value.genres.length > 0) {
      filtered = filtered.filter(movie => {
        const movieGenres = movie.metadata?.Genre?.split(', ').map((g: string) => g.trim()) || []
        return filters.value.genres.some(selectedGenre => movieGenres.includes(selectedGenre))
      })
    }

    // 6. Filter by countries (any selected country must be present)
    if (filters.value.countries.length > 0) {
      filtered = filtered.filter(movie => {
        const movieCountries =
          movie.metadata?.Country?.split(', ').map((c: string) => c.trim()) || []
        return filters.value.countries.some(selectedCountry =>
          movieCountries.includes(selectedCountry)
        )
      })
    }

    // 6.5 Filter by missing metadata (localhost only)
    if (filters.value.showMissingMetadataOnly) {
      filtered = filtered.filter(movie => !movie.metadata || !movie.metadata.imdbID)
    }

    // 7. Apply sorting
    const sortOption =
      SORT_OPTIONS.find(
        opt =>
          opt.field === filters.value.sort.field && opt.direction === filters.value.sort.direction
      ) || SORT_OPTIONS[0]!

    // Only apply sorting if not 'relevance' (which is handled by search)
    if (sortOption.field !== 'relevance') {
      filtered = sortMovies(filtered, sortOption)
    }

    return filtered
  }

  /**
   * Get all unique genres from movies
   */
  const getAvailableGenres = (movies: MovieEntry[]): string[] => {
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
  const getAvailableCountries = (movies: MovieEntry[]): string[] => {
    const countriesSet = new Set<string>()
    movies.forEach(movie => {
      movie.metadata?.Country?.split(', ').forEach((country: string) => {
        countriesSet.add(country.trim())
      })
    })
    return Array.from(countriesSet).sort()
  }

  /**
   * Get filtered and sorted movies from the movie store
   * This is the list that should be used for navigation and display
   */
  const filteredAndSortedMovies = computed((): MovieEntry[] => {
    return filteredMovies.value || []
  })

  return {
    // State
    filters,
    filteredMovies,
    lightweightMovies,
    totalMovies,
    isFiltering,

    // Computed
    hasActiveFilters,
    currentSortOption,
    filteredAndSortedMovies,

    // Actions
    setSort,
    setSearchQuery,
    toggleSource,
    setMinRating,
    setMinYear,
    setMinVotes,
    toggleGenre,
    toggleCountry,
    toggleMissingMetadata,
    setCurrentPage,
    setScrollY,
    resetFilters,
    applyFilters,
    getAvailableGenres,
    getAvailableCountries,
    fetchFilteredMovies,
    fetchLightweightMovies,
  }
})
