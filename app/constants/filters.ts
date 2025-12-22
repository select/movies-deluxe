/**
 * Filter constants for the Movies Deluxe application
 * Centralized location for all filter-related static data
 */

/**
 * YouTube channels available in the database
 * These are the channels we scrape movies from
 */
export const YOUTUBE_CHANNELS = [
  'FilmRise Movies',
  'Mosfilm',
  'Movie Central',
  'Moviedome',
  'Netzkino',
  'Popcornflix',
  'Timeless Classic Movies',
] as const

/**
 * Available movie genres from OMDB metadata
 * Sorted alphabetically for consistent display
 */
export const AVAILABLE_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Film-Noir',
  'History',
  'Horror',
  'Music',
  'Musical',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Short',
  'Thriller',
  'War',
  'Western',
] as const

/**
 * Available countries from OMDB metadata
 * Sorted alphabetically for consistent display
 */
export const AVAILABLE_COUNTRIES = [
  'Australia',
  'Belgium',
  'Canada',
  'Denmark',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'India',
  'Italy',
  'Japan',
  'Netherlands',
  'Portugal',
  'Romania',
  'Russia',
  'South Africa',
  'Soviet Union',
  'Spain',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'USA',
  'Vietnam',
] as const

// Type exports for TypeScript
export type YouTubeChannel = (typeof YOUTUBE_CHANNELS)[number]
export type Genre = (typeof AVAILABLE_GENRES)[number]
export type Country = (typeof AVAILABLE_COUNTRIES)[number]
