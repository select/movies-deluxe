/**
 * Filter option types for Movies Deluxe
 * These are now dynamic and loaded from the database
 */

export interface GenreOption {
  name: string
  count: number
}

export interface CountryOption {
  name: string
  count: number
}

export interface ChannelOption {
  id: string
  name: string
  count: number
}

// API response types
export interface GenresResponse {
  genres: GenreOption[]
}

export interface CountriesResponse {
  countries: CountryOption[]
}

export interface ChannelsResponse {
  channels: ChannelOption[]
}

// Simple string types (no longer const literals)
export type Genre = string
export type Country = string
export type YouTubeChannel = string

/**
 * Movie sorting types
 */

/** Valid sort fields for movies */
export type SortField = 'year' | 'rating' | 'title' | 'votes' | 'relevance'

/** Sort direction */
export type SortDirection = 'asc' | 'desc'

/**
 * Sort option configuration
 */
export interface SortOption {
  field: SortField
  direction: SortDirection
  label: string
}

/**
 * Serializable sort state
 */
export interface SortState {
  field: SortField
  direction: SortDirection
}

/**
 * Filter state interface
 * Contains all parameters for filtering and sorting movies
 */
export interface FilterState {
  // Sorting
  sort: SortState

  // Source filter (can be 'archive.org' or YouTube channel names)
  sources: string[]

  // Rating filter
  minRating: number

  // Year filter
  minYear: number
  maxYear?: number

  // Votes filter
  minVotes: number
  maxVotes?: number

  // Genre filter
  genres: string[]

  // Country filter
  countries: string[]

  // Search query
  searchQuery: string

  // Pagination & UI state
  currentPage: number
  lastScrollY: number
  previousSort?: SortState
}
