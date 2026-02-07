/**
 * Utility for constructing source URLs from type and sourceId
 *
 * URLs are constructed dynamically rather than stored in the database:
 * - Archive.org: https://archive.org/details/${sourceId}
 * - YouTube: https://www.youtube.com/watch?v=${sourceId}
 */

import type { MovieSourceType } from '../types/movie'

/**
 * Construct a URL for a movie source
 *
 * @param type - The source type ('archive.org' or 'youtube')
 * @param sourceId - The source identifier (Archive.org identifier or YouTube video ID)
 * @returns The full URL to the source
 */
export function getSourceUrl(type: MovieSourceType, sourceId: string): string {
  switch (type) {
    case 'archive.org':
      return `https://archive.org/details/${sourceId}`
    case 'youtube':
      return `https://www.youtube.com/watch?v=${sourceId}`
    default:
      throw new Error(`Unknown source type: ${type}`)
  }
}
