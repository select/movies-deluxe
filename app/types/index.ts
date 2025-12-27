/**
 * Frontend Type Definitions
 *
 * This module re-exports shared types from ~/shared/types/movie and adds
 * frontend-specific type utilities for the Nuxt application.
 *
 * ## Usage in components/stores:
 * ```ts
 * import type { MovieEntry, MovieSource, LoadingState } from '~/app/types'
 * ```
 *
 * ## Type Organization:
 * - **Shared types** (from ~/shared/types/movie): Used by both frontend, server, and scripts
 * - **Frontend types** (defined here): Only used in the Nuxt app
 */

// Re-export all shared types from the shared directory (Nuxt 4 ~/shared alias)
export type {
  // Core movie types
  MovieEntry,
  MovieSource,
  MovieSourceType,
  MovieSourceBase,
  ArchiveOrgSource,
  YouTubeSource,
  MovieMetadata,

  // Database types
  DatabaseSchema,
  MoviesDatabase,

  // OMDB types
  OMDBSearchResult,
  OMDBSearchResponse,
  MatchResult,

  // Utility types
  TemporaryId,
} from '~~/shared/types/movie'

// Re-export utility functions
export {
  isTemporaryId,
  isImdbId,
  generateArchiveId,
  generateYouTubeId,
  extractIdentifier,
  MatchConfidence,
} from '~~/shared/types/movie'

/**
 * Frontend-specific types
 */

/**
 * Lightweight movie entry with only essential data for virtual scrolling
 * Used for initial load to minimize memory usage
 */
export interface LightweightMovieEntry {
  imdbId: string
  title: string
  year: number
}

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

/**
 * Movie sorting types
 */

/** Valid sort fields for movies */
export type SortField = 'year' | 'rating' | 'title' | 'votes' | 'relevance'

/** Sort direction */
export type SortDirection = 'asc' | 'desc'

/**
 * Sort option configuration
 *
 * @example
 * ```ts
 * const sortOption: SortOption = {
 *   field: 'year',
 *   direction: 'desc',
 *   label: 'Year (Newest)'
 * }
 * ```
 */
export interface SortOption {
  field: SortField
  direction: SortDirection
  label: string
}
