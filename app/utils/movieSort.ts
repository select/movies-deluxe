import type { MovieEntry, SortField, SortDirection, SortOption } from '~/types'

// Re-export types for use in other modules
export type { SortField, SortDirection, SortOption }

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

    // Tie-breaker: title then imdbId
    if (yearA === yearB) {
      const titleA = a.title
      const titleB = b.title
      const titleCompare = titleA.localeCompare(titleB)

      if (titleCompare !== 0) return titleCompare
      const imdbIdA = a.imdbId || ''
      const imdbIdB = b.imdbId || ''
      return imdbIdA.localeCompare(imdbIdB)
    }

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

    // Tie-breaker: title then imdbId
    if (ratingA === ratingB) {
      const titleA = a.title
      const titleB = b.title
      const titleCompare = titleA.localeCompare(titleB)

      if (titleCompare !== 0) return titleCompare
      const imdbIdA = a.imdbId || ''
      const imdbIdB = b.imdbId || ''
      return imdbIdA.localeCompare(imdbIdB)
    }

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

    if (comparison !== 0) return direction === 'asc' ? comparison : -comparison
    const imdbIdA = a.imdbId || ''
    const imdbIdB = b.imdbId || ''
    return imdbIdA.localeCompare(imdbIdB)
  })
}

/**
 * Sort movies by IMDB votes (popularity)
 */
export function sortByVotes(movies: MovieEntry[], direction: SortDirection): MovieEntry[] {
  return [...movies].sort((a, b) => {
    const votesAStr = a.metadata?.imdbVotes
    const votesBStr = b.metadata?.imdbVotes
    const votesA =
      typeof votesAStr === 'number'
        ? votesAStr
        : parseInt(String(votesAStr || '0').replace(/,/g, ''))
    const votesB =
      typeof votesBStr === 'number'
        ? votesBStr
        : parseInt(String(votesBStr || '0').replace(/,/g, ''))

    // Movies without votes go to the end
    if (votesA === 0 && votesB === 0) return 0
    if (votesA === 0) return 1
    if (votesB === 0) return -1

    // Tie-breaker: title then imdbId
    if (votesA === votesB) {
      const titleA = a.title
      const titleB = b.title
      const titleCompare = titleA.localeCompare(titleB)

      if (titleCompare !== 0) return titleCompare
      const imdbIdA = a.imdbId || ''
      const imdbIdB = b.imdbId || ''
      return imdbIdA.localeCompare(imdbIdB)
    }

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
