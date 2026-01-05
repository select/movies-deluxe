import {
  isTemporaryId,
  isImdbId,
  generateArchiveId,
  generateYouTubeId,
  extractIdentifier,
  QualityLabel,
} from '../../shared/types/movie'
import type {
  MovieEntry,
  MovieSource,
  MovieSourceType,
  MovieSourceBase,
  ArchiveOrgSource,
  YouTubeSource,
  MovieMetadata,
  AIMetadata,
  DatabaseSchema,
  MoviesDatabase,
  OMDBSearchResult,
  OMDBSearchResponse,
  MatchResult,
  MatchConfidence,
  TemporaryId,
} from '../../shared/types/movie'
import type { Collection, CollectionsDatabase, SavedQuery } from '../../shared/types/collections'
import type {
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
} from '../../shared/types/filters'

/**
 * Frontend Type Definitions
 *
 * This module re-exports shared types and adds frontend-specific type utilities.
 * Shared types from shared/types/ are auto-imported by Nuxt.
 *
 * ## Usage in components/stores:
 * ```ts
 * import type { MovieEntry, LoadingState } from '~/types'
 * ```
 */

// Re-export auto-imported shared types for convenience
// These types are auto-imported from shared/types/ but we re-export them
// here so components can import from a single location (~/types)
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
  MatchConfidence,

  // Utility types
  TemporaryId,

  // Collection types
  Collection,
  CollectionsDatabase,

  // Filter types
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
  SavedQuery,
}

// Re-export utility functions
export {
  isTemporaryId,
  isImdbId,
  generateArchiveId,
  generateYouTubeId,
  extractIdentifier,
  QualityLabel,
}

export type {
  ThemeVariant,
  ThemeColors,
  ThemeMetadata,
  ThemeDefinition,
  ThemeRegistry,
} from './theme'

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
  year?: number
  imdbRating?: string | number
  imdbVotes?: string | number
  language?: string
  sourceType?: MovieSourceType
  channelName?: string
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
