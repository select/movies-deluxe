import type { FilterState } from '~/types'

export const useAdminSearchFilters = () => {
  const DEFAULT_FILTERS: FilterState = {
    sort: { field: 'year', direction: 'desc' },
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

  const filters = ref<FilterState>({ ...DEFAULT_FILTERS })

  const activeFiltersCount = computed(() => {
    let count = 0
    if (filters.value.sources.length > 0) count++
    if (filters.value.minRating > 0) count++
    if (filters.value.minYear > 0) count++
    if (filters.value.minVotes > 0) count++
    if (filters.value.genres.length > 0) count++
    if (filters.value.countries.length > 0) count++
    return count
  })

  const hasActiveFilters = computed(() => activeFiltersCount.value > 0)

  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
  }

  return {
    filters,
    activeFiltersCount,
    hasActiveFilters,
    resetFilters,
  }
}
