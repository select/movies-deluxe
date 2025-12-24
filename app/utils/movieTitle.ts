import type { MovieEntry } from '~/types'

/**
 * Get the primary title from a movie entry (handles both string and string[] titles)
 */
export function getPrimaryTitle(movie: MovieEntry): string {
  if (!movie || !movie.title) {
    return ''
  }

  if (typeof movie.title === 'string') {
    return movie.title
  }

  if (Array.isArray(movie.title) && movie.title.length > 0) {
    const firstTitle = movie.title[0]
    return typeof firstTitle === 'string' ? firstTitle : ''
  }

  return ''
}

/**
 * Get all titles from a movie entry as an array
 */
export function getAllTitles(movie: MovieEntry): string[] {
  if (!movie || !movie.title) {
    return []
  }

  if (typeof movie.title === 'string') {
    return [movie.title]
  }

  if (Array.isArray(movie.title)) {
    return movie.title.filter(t => typeof t === 'string' && t.length > 0)
  }

  return []
}

/**
 * Get original titles from movie sources
 */
export function getOriginalTitles(movie: MovieEntry): string[] {
  if (!movie || !movie.sources) {
    return []
  }

  const originalTitles: string[] = []

  for (const source of movie.sources) {
    if (source.title && typeof source.title === 'string') {
      originalTitles.push(source.title)
    }
  }

  return originalTitles.filter((title, index, arr) => arr.indexOf(title) === index) // Remove duplicates
}

/**
 * Get all titles including original source titles
 */
export function getAllTitlesIncludingOriginal(movie: MovieEntry): string[] {
  const movieTitles = getAllTitles(movie)
  const originalTitles = getOriginalTitles(movie)

  // Combine and deduplicate
  const allTitles = [...movieTitles, ...originalTitles]
  return allTitles.filter((title, index, arr) => arr.indexOf(title) === index)
}

/**
 * Check if a movie has multiple titles
 */
export function hasMultipleTitles(movie: MovieEntry): boolean {
  return Array.isArray(movie.title) && movie.title.length > 1
}

/**
 * Check if a movie has original source titles
 */
export function hasOriginalTitles(movie: MovieEntry): boolean {
  return getOriginalTitles(movie).length > 0
}

/**
 * Normalize title for comparison (lowercase, trimmed)
 */
export function normalizeTitle(title: string): string {
  return (title || '').toLowerCase().trim()
}
