import {
  SORT_OPTIONS,
  type SortOption,
  type SortField,
  type SortDirection,
} from '~/utils/movieSort'

export interface SortState {
  field: SortField
  direction: SortDirection
}

export interface FilterState {
  sort: SortState
  previousSort?: SortState
  sources: string[]
  minRating: number
  minYear: number
  minVotes: number
  genres: string[]
  countries: string[]
  searchQuery: string
  showMissingMetadataOnly: boolean
  currentPage: number
  lastScrollY: number
}

const DEFAULT_FILTERS: FilterState = {
  sort: { field: 'year', direction: 'desc' },
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

export const useFilterStore = defineStore('filter', () => {
  const getInitialFilters = (): FilterState => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    try {
      const stored = localStorage.getItem('movies-deluxe-filters')
      if (stored) return { ...DEFAULT_FILTERS, ...JSON.parse(stored) }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_FILTERS
  }

  const filters = ref<FilterState>(getInitialFilters())

  const persistFilters = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('movies-deluxe-filters', JSON.stringify(filters.value))
    }
  }

  const setSort = (option: SortOption) => {
    filters.value.sort = { field: option.field, direction: option.direction }
    if (filters.value.searchQuery !== '') filters.value.previousSort = undefined
    persistFilters()
  }

  const currentSortOption = computed((): SortOption => {
    const stored = filters.value.sort
    return (
      SORT_OPTIONS.find(opt => opt.field === stored.field && opt.direction === stored.direction) ||
      SORT_OPTIONS[0]!
    )
  })

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
    persistFilters()
  }

  const toggleSource = (source: string) => {
    filters.value.sources = filters.value.sources.includes(source)
      ? filters.value.sources.filter(s => s !== source)
      : [...filters.value.sources, source]
    persistFilters()
  }

  const setMinRating = (rating: number) => {
    filters.value.minRating = rating
    persistFilters()
  }

  const setMinYear = (year: number) => {
    filters.value.minYear = year
    persistFilters()
  }

  const setMinVotes = (votes: number) => {
    filters.value.minVotes = votes
    persistFilters()
  }

  const toggleGenre = (genre: string) => {
    filters.value.genres = filters.value.genres.includes(genre)
      ? filters.value.genres.filter(g => g !== genre)
      : [...filters.value.genres, genre]
    persistFilters()
  }

  const toggleCountry = (country: string) => {
    filters.value.countries = filters.value.countries.includes(country)
      ? filters.value.countries.filter(c => c !== country)
      : [...filters.value.countries, country]
    persistFilters()
  }

  const setCurrentPage = (page: number) => {
    filters.value.currentPage = page
    persistFilters()
  }

  const setScrollY = (y: number) => {
    filters.value.lastScrollY = y
    persistFilters()
  }

  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
    persistFilters()
  }

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

  return {
    filters,
    hasActiveFilters,
    currentSortOption,
    setSort,
    setSearchQuery,
    toggleSource,
    setMinRating,
    setMinYear,
    setMinVotes,
    toggleGenre,
    toggleCountry,
    setCurrentPage,
    setScrollY,
    resetFilters,
  }
})
