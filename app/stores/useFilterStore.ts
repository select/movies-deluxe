import { useStorage } from '@vueuse/core'
import type { MovieEntry, MovieSourceType } from '~/app/types'
import { SORT_OPTIONS, sortMovies, type SortOption } from '~/utils/movieSort'

/**
 * Filter state interface
 */
export interface FilterState {
  // Sorting
  sort: SortOption

  // Source filter
  sources: MovieSourceType[]

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
}

/**
 * Default filter state
 */
const DEFAULT_FILTERS: FilterState = {
  sort: SORT_OPTIONS[0], // Year (Newest)
  sources: [],
  minRating: 0,
  minYear: 0,
  minVotes: 0,
  genres: [],
  countries: [],
}

/**
 * Filter store with persistent state using VueUse useStorage
 */
export const useFilterStore = defineStore('filter', () => {
  // Persistent state using localStorage (with SSR-safe defaults)
  const filters = useStorage<FilterState>(
    'movies-deluxe-filters',
    DEFAULT_FILTERS,
    typeof window !== 'undefined' ? localStorage : undefined,
    {
      mergeDefaults: true, // Merge with defaults if keys are missing
    }
  )

  /**
   * Set sort option
   */
  const setSort = (option: SortOption) => {
    filters.value.sort = option
  }

  /**
   * Toggle source filter
   */
  const toggleSource = (source: MovieSourceType) => {
    const index = filters.value.sources.indexOf(source)
    if (index === -1) {
      filters.value.sources.push(source)
    } else {
      filters.value.sources.splice(index, 1)
    }
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
    const index = filters.value.genres.indexOf(genre)
    if (index === -1) {
      filters.value.genres.push(genre)
    } else {
      filters.value.genres.splice(index, 1)
    }
  }

  /**
   * Toggle country filter
   */
  const toggleCountry = (country: string) => {
    const index = filters.value.countries.indexOf(country)
    if (index === -1) {
      filters.value.countries.push(country)
    } else {
      filters.value.countries.splice(index, 1)
    }
  }

  /**
   * Reset all filters to defaults
   */
  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
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

    // 1. Filter by source
    if (filters.value.sources.length > 0) {
      filtered = filtered.filter(movie =>
        movie.sources.some(source => filters.value.sources.includes(source.type))
      )
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
        const movieGenres = movie.metadata?.Genre?.split(', ').map(g => g.trim()) || []
        return filters.value.genres.some(selectedGenre => movieGenres.includes(selectedGenre))
      })
    }

    // 6. Filter by countries (any selected country must be present)
    if (filters.value.countries.length > 0) {
      filtered = filtered.filter(movie => {
        const movieCountries = movie.metadata?.Country?.split(', ').map(c => c.trim()) || []
        return filters.value.countries.some(selectedCountry =>
          movieCountries.includes(selectedCountry)
        )
      })
    }

    // 7. Apply sorting
    filtered = sortMovies(filtered, filters.value.sort)

    return filtered
  }

  /**
   * Get all unique genres from movies
   */
  const getAvailableGenres = (movies: MovieEntry[]): string[] => {
    const genresSet = new Set<string>()
    movies.forEach(movie => {
      movie.metadata?.Genre?.split(', ').forEach(genre => {
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
      movie.metadata?.Country?.split(', ').forEach(country => {
        countriesSet.add(country.trim())
      })
    })
    return Array.from(countriesSet).sort()
  }

  return {
    // State
    filters,

    // Computed
    hasActiveFilters,

    // Actions
    setSort,
    toggleSource,
    setMinRating,
    setMinYear,
    setMinVotes,
    toggleGenre,
    toggleCountry,
    resetFilters,
    applyFilters,
    getAvailableGenres,
    getAvailableCountries,
  }
})
