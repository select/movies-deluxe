import type { LightweightMovie } from '#shared/types/movie'

/**
 * Frontend Type Definitions
 *
 * This module re-exports shared types and adds frontend-specific type utilities.
 *
 * ## Usage in components/stores:
 * ```ts
 * import type { MovieEntry, LoadingState } from '~/types'
 * ```
 */

export type {
  // Core movie types
  MovieEntry,
  LightweightMovie,
  MovieSource,
  MovieSourceType,
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
  MatchConfidence,

  // Utility types
  TemporaryId,
  SourceStatus,
  SourceUnavailableReason,
} from '#shared/types/movie'

export type { Collection, CollectionsDatabase, SavedQuery } from '#shared/types/collections'

export type {
  Genre,
  Country,
  YouTubeChannel,
  GenreOption,
  CountryOption,
  ChannelOption,
  GenresResponse,
  CountriesResponse,
  ChannelsResponse,
  SortField,
  SortDirection,
  SortOption,
  SortState,
  FilterState,
  SearchMode,
} from '#shared/types/filters'

// Re-export utility functions
export {
  isTemporaryId,
  isImdbId,
  generateArchiveId,
  generateYouTubeId,
  extractIdentifier,
  QualityLabel,
  SourceQualityMark,
} from '#shared/types/movie'

/**
 * Frontend-specific types
 */

/**
 * Lightweight movie entry with only essential data for virtual scrolling
 * Used for initial load to minimize memory usage
 * @deprecated Use LightweightMovie instead
 */
export type LightweightMovieEntry = LightweightMovie

/**
 * Poster availability status
 *
 * @example
 * ```ts
 * const posterStatus: PosterStatus = {
 *   hasLocal: true,
 *   hasOmdb: false,
 *   url: getPosterPath('tt1234567')
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
