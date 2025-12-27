import type { MovieEntry } from '../types/movie'

/**
 * Get the primary title from a movie entry (handles both string and string[] titles)
 */
export function getPrimaryTitle(movie: MovieEntry | { title: string }): string {
  if (!movie || !movie.title) {
    return ''
  }

  if (typeof movie.title === 'string') {
    return movie.title
  }

  // Fallback for legacy data that might still have arrays
  if (Array.isArray(movie.title) && (movie.title as any).length > 0) {
    const firstTitle = (movie.title as any)[0]
    return typeof firstTitle === 'string' ? firstTitle : ''
  }

  return ''
}

/**
 * Get all titles from a movie entry as an array
 */
export function getAllTitles(movie: MovieEntry | { title: string }): string[] {
  if (!movie || !movie.title) {
    return []
  }

  if (typeof movie.title === 'string') {
    return [movie.title]
  }

  // Fallback for legacy data that might still have arrays
  if (Array.isArray(movie.title)) {
    return (movie.title as any[]).filter((t: any) => typeof t === 'string' && t.length > 0)
  }

  return []
}

/**
 * Normalize title for comparison (lowercase, trimmed)
 */
export function normalizeTitle(title: string): string {
  return (title || '').toLowerCase().trim()
}
