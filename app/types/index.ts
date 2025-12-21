/**
 * Frontend Type Definitions
 *
 * This module re-exports shared types from /types/movie.ts and adds
 * frontend-specific type utilities for the Nuxt application.
 *
 * ## Usage in components/stores:
 * ```ts
 * import type { MovieEntry, MovieSource, LoadingState } from '~/app/types'
 * ```
 *
 * ## Type Organization:
 * - **Shared types** (from /types/movie.ts): Used by both frontend and scripts
 * - **Frontend types** (defined here): Only used in the Nuxt app
 */

// Re-export all shared types from the root types directory
export type {
  // Core movie types
  MovieEntry,
  MovieSource,
  MovieSourceType,
  MovieSourceBase,
  ArchiveOrgSource,
  YouTubeSource,
  MovieMetadata,
  AIMetadata,

  // Database types
  DatabaseSchema,
  MoviesDatabase,

  // OMDB types
  OMDBSearchResult,
  OMDBSearchResponse,
  MatchResult,

  // Utility types
  TemporaryId,
} from '~/types/movie'

// Re-export utility functions
export {
  isTemporaryId,
  isImdbId,
  generateArchiveId,
  generateYouTubeId,
  extractIdentifier,
  MatchConfidence,
} from '~/types/movie'

/**
 * Frontend-specific types
 */

/**
 * Loading state for async operations in stores
 *
 * @example
 * ```ts
 * const isLoading = ref<LoadingState>({
 *   movies: false,
 *   movieDetails: false,
 *   imdbFetch: false,
 * })
 * ```
 */
export interface LoadingState {
  /** Loading movies from data source */
  movies: boolean
  /** Loading individual movie details */
  movieDetails: boolean
  /** Fetching OMDB metadata */
  imdbFetch: boolean
}

/**
 * Poster availability status
 *
 * @example
 * ```ts
 * const posterStatus: PosterStatus = {
 *   hasLocal: true,
 *   hasOmdb: false,
 *   url: '/posters/tt1234567.jpg'
 * }
 * ```
 */
export interface PosterStatus {
  /** Whether a local poster exists */
  hasLocal: boolean
  /** Whether OMDB poster URL is available */
  hasOmdb: boolean
  /** Final poster URL to use */
  url: string
}

/**
 * Movie display preferences
 *
 * @example
 * ```ts
 * const preferences: DisplayPreferences = {
 *   showPosters: true,
 *   gridColumns: 4,
 *   showMetadata: true
 * }
 * ```
 */
export interface DisplayPreferences {
  /** Show posters in grid view */
  showPosters: boolean
  /** Grid columns (2, 3, 4, etc.) */
  gridColumns: number
  /** Show metadata badges */
  showMetadata: boolean
}
