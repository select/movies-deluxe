import type { LocationQuery, LocationQueryValue } from 'vue-router'
import type {
  FilterState,
  SearchMode,
  SortDirection,
  SortField,
  SortOption,
  SortState,
} from '#shared/types/filters'
import { hasKeywords } from '~/utils/searchQueryParser'

export const SEARCH_SORT_OPTIONS: SortOption[] = [
  { field: 'relevance', direction: 'desc', label: 'Relevance' },
  { field: 'year', direction: 'desc', label: 'Year (Newest)' },
  { field: 'year', direction: 'asc', label: 'Year (Oldest)' },
  { field: 'rating', direction: 'desc', label: 'Rating (High)' },
  { field: 'rating', direction: 'asc', label: 'Rating (Low)' },
  { field: 'title', direction: 'asc', label: 'Title (A-Z)' },
  { field: 'title', direction: 'desc', label: 'Title (Z-A)' },
  { field: 'votes', direction: 'desc', label: 'Most Popular' },
]

export const DEFAULT_SEARCH_FILTERS: FilterState = {
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

export const SEARCH_URL_PARAM_KEYS = [
  'q',
  'mode',
  'genres',
  'countries',
  'source',
  'sources',
  'year',
  'rating',
  'votes',
  'sort',
] as const

const MIN_YEAR_BOUND = 1910
const MAX_YEAR_BOUND = 2025
const MAX_VOTES_BOUND = 1000000

const getFirstQueryValue = (
  value: LocationQueryValue | LocationQueryValue[] | undefined
): string => {
  if (Array.isArray(value)) {
    const first = value.find((v): v is string => typeof v === 'string' && v.trim().length > 0)
    return first ? first.trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

const parseListQueryValue = (
  value: LocationQueryValue | LocationQueryValue[] | undefined
): string[] => {
  if (!value) return []
  const rawItems = Array.isArray(value) ? value : [value]
  const items = rawItems
    .filter((v): v is string => typeof v === 'string')
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(Boolean)
  return Array.from(new Set(items))
}

const parseYearRange = (raw: string): { minYear: number; maxYear: number } => {
  if (!raw) return { minYear: 0, maxYear: 0 }

  const rangeMatch = raw.match(/^(\d{4})?-(\d{4})?$/)
  if (rangeMatch && (rangeMatch[1] || rangeMatch[2])) {
    let min = rangeMatch[1] ? Number.parseInt(rangeMatch[1], 10) : 0
    let max = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : 0

    if (min > 0 && min <= MIN_YEAR_BOUND) min = 0
    if (min > MAX_YEAR_BOUND) min = MAX_YEAR_BOUND
    if (max >= MAX_YEAR_BOUND) max = 0
    if (max > 0 && max < MIN_YEAR_BOUND) max = MIN_YEAR_BOUND

    if (min > 0 && max > 0 && min > max) {
      ;[min, max] = [max, min]
    }
    return { minYear: min, maxYear: max }
  }

  const singleMatch = raw.match(/^(\d{4})$/)
  if (singleMatch?.[1]) {
    const year = Math.min(
      MAX_YEAR_BOUND,
      Math.max(MIN_YEAR_BOUND, Number.parseInt(singleMatch[1], 10))
    )
    return { minYear: year, maxYear: year }
  }

  return { minYear: 0, maxYear: 0 }
}

const parseVotesRange = (raw: string): { minVotes: number; maxVotes: number } => {
  if (!raw) return { minVotes: 0, maxVotes: 0 }

  const rangeMatch = raw.match(/^(\d+)?-(\d+)?$/)
  if (rangeMatch && (rangeMatch[1] || rangeMatch[2])) {
    let min = rangeMatch[1] ? Number.parseInt(rangeMatch[1], 10) : 0
    let max = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : 0

    if (max >= MAX_VOTES_BOUND) max = 0
    if (min > 0 && max > 0 && min > max) {
      ;[min, max] = [max, min]
    }
    return { minVotes: min, maxVotes: max }
  }

  const singleMatch = raw.match(/^(\d+)$/)
  if (singleMatch?.[1]) {
    const min = Number.parseInt(singleMatch[1], 10)
    return { minVotes: min > 0 ? min : 0, maxVotes: 0 }
  }

  return { minVotes: 0, maxVotes: 0 }
}

const parseRating = (raw: string): number => {
  if (!raw) return 0
  const parsed = Number.parseFloat(raw)
  if (Number.isNaN(parsed) || parsed <= 0) return 0
  return Math.min(10, parsed)
}

const parseSort = (raw: string, hasSearchQuery: boolean): SortState => {
  if (!raw) {
    return hasSearchQuery
      ? { field: 'relevance', direction: 'desc' }
      : { ...DEFAULT_SEARCH_FILTERS.sort }
  }

  const normalized = raw.toLowerCase()
  if (normalized === 'relevance' || normalized === 'relevance-desc') {
    return hasSearchQuery
      ? { field: 'relevance', direction: 'desc' }
      : { ...DEFAULT_SEARCH_FILTERS.sort }
  }

  const [fieldPart, dirPart] = normalized.split('-')
  const field = fieldPart as SortField

  if (dirPart === 'asc' || dirPart === 'desc') {
    const match = SEARCH_SORT_OPTIONS.find(
      opt => opt.field === field && opt.direction === (dirPart as SortDirection)
    )
    if (match) {
      return { field: match.field, direction: match.direction }
    }
  } else {
    const shorthandMatch = SEARCH_SORT_OPTIONS.find(opt => opt.field === field)
    if (shorthandMatch) {
      return { field: shorthandMatch.field, direction: shorthandMatch.direction }
    }
  }

  return hasSearchQuery
    ? { field: 'relevance', direction: 'desc' }
    : { ...DEFAULT_SEARCH_FILTERS.sort }
}

const parseSearchMode = (raw: string, searchQuery: string): SearchMode => {
  if (hasKeywords(searchQuery)) return 'exact'
  const normalized = raw.toLowerCase()
  if (normalized === 'semantic' || normalized === 'hybrid') {
    return 'semantic'
  }
  return 'exact'
}

export const hasSearchUrlParams = (query: LocationQuery): boolean => {
  return SEARCH_URL_PARAM_KEYS.some(key => query[key] !== undefined)
}

export const parseSearchUrlQuery = (query: LocationQuery): FilterState => {
  const searchQuery = getFirstQueryValue(query.q)
  const searchMode = parseSearchMode(getFirstQueryValue(query.mode), searchQuery)
  const genres = parseListQueryValue(query.genres)
  const countries = parseListQueryValue(query.countries)
  const sources = parseListQueryValue(query.source ?? query.sources)
  const { minYear, maxYear } = parseYearRange(getFirstQueryValue(query.year))
  const minRating = parseRating(getFirstQueryValue(query.rating))
  const { minVotes, maxVotes } = parseVotesRange(getFirstQueryValue(query.votes))
  const sort = parseSort(getFirstQueryValue(query.sort), searchQuery.length > 0)

  return {
    sort,
    sources,
    minRating,
    minYear,
    maxYear,
    minVotes,
    maxVotes,
    genres,
    countries,
    searchQuery,
    searchMode,
  }
}

export const serializeFiltersToUrlQuery = (filters: FilterState): Record<string, string> => {
  const query: Record<string, string> = {}

  const trimmedQuery = filters.searchQuery.trim()
  if (trimmedQuery) {
    query.q = trimmedQuery
  }

  if (filters.searchMode === 'semantic') {
    query.mode = 'semantic'
  }

  if (filters.genres.length > 0) {
    query.genres = filters.genres.join(',')
  }

  if (filters.countries.length > 0) {
    query.countries = filters.countries.join(',')
  }

  if (filters.sources.length > 0) {
    query.source = filters.sources.join(',')
  }

  const minYear = filters.minYear > MIN_YEAR_BOUND ? filters.minYear : 0
  const maxYear =
    filters.maxYear && filters.maxYear > 0 && filters.maxYear < MAX_YEAR_BOUND ? filters.maxYear : 0

  if (minYear > 0 && maxYear > 0) {
    query.year = minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`
  } else if (minYear > 0) {
    query.year = `${minYear}-`
  } else if (maxYear > 0) {
    query.year = `-${maxYear}`
  }

  if (filters.minRating > 0) {
    query.rating = String(filters.minRating)
  }

  const minVotes = filters.minVotes > 0 ? filters.minVotes : 0
  const maxVotes =
    filters.maxVotes && filters.maxVotes > 0 && filters.maxVotes < MAX_VOTES_BOUND
      ? filters.maxVotes
      : 0

  if (minVotes > 0 && maxVotes > 0) {
    query.votes = `${minVotes}-${maxVotes}`
  } else if (minVotes > 0) {
    query.votes = `${minVotes}-`
  } else if (maxVotes > 0) {
    query.votes = `-${maxVotes}`
  }

  if (trimmedQuery) {
    if (filters.sort.field !== 'relevance') {
      query.sort = `${filters.sort.field}-${filters.sort.direction}`
    }
  } else if (
    filters.sort.field !== 'relevance' &&
    (filters.sort.field !== 'year' || filters.sort.direction !== 'desc')
  ) {
    query.sort = `${filters.sort.field}-${filters.sort.direction}`
  }

  return query
}

export const areUrlQueriesEqual = (a: LocationQuery, b: Record<string, string>): boolean => {
  const keysToCheck = new Set<string>([
    ...SEARCH_URL_PARAM_KEYS.filter(key => a[key] !== undefined),
    ...Object.keys(b),
  ])

  for (const key of keysToCheck) {
    const valA = getFirstQueryValue(a[key])
    const valB = b[key] ?? ''
    if (valA !== valB) return false
  }

  return true
}
