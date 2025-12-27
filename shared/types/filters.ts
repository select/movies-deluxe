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
