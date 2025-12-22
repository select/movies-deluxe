import type { MovieEntry } from '~/types'

export type SortField = 'year' | 'rating' | 'title' | 'votes' | 'relevance'
export type SortDirection = 'asc' | 'desc'

export interface SortOption {
  field: SortField
  direction: SortDirection
  label: string
}

/**
 * Available sort options for movies
 */
export const SORT_OPTIONS: SortOption[] = [
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
 * Sort movies by year
 */
export function sortByYear(movies: MovieEntry[], direction: SortDirection): MovieEntry[] {
  return [...movies].sort((a, b) => {
    const yearA = a.year || 0
    const yearB = b.year || 0

    // Movies without year go to the end
    if (yearA === 0 && yearB === 0) return 0
    if (yearA === 0) return 1
    if (yearB === 0) return -1

    return direction === 'asc' ? yearA - yearB : yearB - yearA
  })
}

/**
 * Sort movies by IMDB rating
 */
export function sortByRating(movies: MovieEntry[], direction: SortDirection): MovieEntry[] {
  return [...movies].sort((a, b) => {
    const ratingA = parseFloat(a.metadata?.imdbRating || '0')
    const ratingB = parseFloat(b.metadata?.imdbRating || '0')

    // Movies without rating go to the end
    if (ratingA === 0 && ratingB === 0) return 0
    if (ratingA === 0) return 1
    if (ratingB === 0) return -1

    return direction === 'asc' ? ratingA - ratingB : ratingB - ratingA
  })
}

/**
 * Sort movies by title
 */
export function sortByTitle(movies: MovieEntry[], direction: SortDirection): MovieEntry[] {
  return [...movies].sort((a, b) => {
    const titleA = a.title.toLowerCase()
    const titleB = b.title.toLowerCase()

    const comparison = titleA.localeCompare(titleB)
    return direction === 'asc' ? comparison : -comparison
  })
}

/**
 * Sort movies by IMDB votes (popularity)
 */
export function sortByVotes(movies: MovieEntry[], direction: SortDirection): MovieEntry[] {
  return [...movies].sort((a, b) => {
    const votesA = parseInt(a.metadata?.imdbVotes?.replace(/,/g, '') || '0')
    const votesB = parseInt(b.metadata?.imdbVotes?.replace(/,/g, '') || '0')

    // Movies without votes go to the end
    if (votesA === 0 && votesB === 0) return 0
    if (votesA === 0) return 1
    if (votesB === 0) return -1

    return direction === 'asc' ? votesA - votesB : votesB - votesA
  })
}

/**
 * Sort movies based on sort option
 */
export function sortMovies(movies: MovieEntry[], sortOption: SortOption): MovieEntry[] {
  switch (sortOption.field) {
    case 'year':
      return sortByYear(movies, sortOption.direction)
    case 'rating':
      return sortByRating(movies, sortOption.direction)
    case 'title':
      return sortByTitle(movies, sortOption.direction)
    case 'votes':
      return sortByVotes(movies, sortOption.direction)
    default:
      return movies
  }
}

/**
 * Find sort option by field and direction
 */
export function findSortOption(field: SortField, direction: SortDirection): SortOption | undefined {
  return SORT_OPTIONS.find(opt => opt.field === field && opt.direction === direction)
}
