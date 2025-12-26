/**
 * Centralized Movie Data Types
 *
 * This file defines the TypeScript interfaces for the centralized movie database
 * stored in public/data/movies.json. Movies are indexed by imdbId or temporary IDs.
 */

/**
 * Source types for movie streaming locations
 */
export type MovieSourceType = 'archive.org' | 'youtube'

/**
 * Base interface for all movie sources
 */
export interface MovieSourceBase {
  type: MovieSourceType
  url: string
  title: string // Original title from the source (before cleaning/processing)
  label?: string // Custom label for this source (e.g., "Widescreen", "HD")
  quality?: string // Quality indicator (e.g., "720p", "1080p", "SD")
  description?: string // Original source description (e.g., YouTube description)
  addedAt: string // ISO 8601 timestamp
}

/**
 * Archive.org specific source data
 */
export interface ArchiveOrgSource extends MovieSourceBase {
  type: 'archive.org'
  id: string // Archive.org identifier (e.g., "HeartsOfHumanity")
  collection?: string // e.g., 'feature_films'
  downloads?: number
  thumbnail?: string
  releaseDate?: string // ISO date from Archive.org metadata - REQUIRED for OMDB year validation
  language?: string // Language code from Archive.org metadata (e.g., 'en', 'es', 'fr')
}

/**
 * YouTube specific source data
 */
export interface YouTubeSource extends MovieSourceBase {
  type: 'youtube'
  id: string // YouTube video ID (e.g., "dQw4w9WgXcQ")
  channelName: string
  channelId?: string
  releaseYear?: number // Extracted from video title - REQUIRED for OMDB year validation
  language?: string // Language code from channel config (e.g., 'en', 'es')
  duration?: number // Duration in seconds
  publishedAt?: string
  viewCount?: number
  thumbnail?: string
}

/**
 * Union type for all movie sources
 */
export type MovieSource = ArchiveOrgSource | YouTubeSource

/**
 * OMDB metadata structure
 * Note: OMDB API returns fields with capital first letters
 */
export interface MovieMetadata {
  Title?: string
  Year?: string
  Rated?: string
  Released?: string
  Runtime?: string
  Genre?: string
  Director?: string
  Writer?: string
  Actors?: string
  Plot?: string
  Language?: string
  Country?: string
  Awards?: string
  Poster?: string
  Ratings?: Array<{
    Source: string
    Value: string
  }>
  Metascore?: string
  imdbRating?: string
  imdbVotes?: string
  imdbID?: string
  Type?: string
  DVD?: string
  BoxOffice?: string
  Production?: string
  Website?: string
  Response?: string
}

/**
 * Main movie entry structure
 */
export interface MovieEntry {
  imdbId: string // IMDB ID (e.g., 'tt0012345') or temporary ID (e.g., 'archive-xyz', 'youtube-abc')
  title: string | string[] // Can be array when merging entries with different titles
  year?: number
  sources: MovieSource[]
  metadata?: MovieMetadata
  verified?: boolean // Whether this entry has been manually verified by a human
  lastUpdated: string // ISO 8601 timestamp
}

/**
 * Schema metadata for the database
 */
export interface DatabaseSchema {
  version: string
  description: string
  lastUpdated: string
}

/**
 * The complete movies.json database structure
 */
export interface MoviesDatabase {
  _schema: DatabaseSchema
  _example?: MovieEntry // Optional example entry for documentation
  [imdbId: string]: MovieEntry | DatabaseSchema | MovieEntry | undefined
}

/**
 * Utility type for temporary IDs
 */
export type TemporaryId = `archive-${string}` | `youtube-${string}`

/**
 * Type guard to check if an ID is a temporary ID
 */
export function isTemporaryId(id: string): id is TemporaryId {
  return id.startsWith('archive-') || id.startsWith('youtube-')
}

/**
 * Type guard to check if an ID is a valid IMDB ID
 */
export function isImdbId(id: string): boolean {
  return /^tt\d{7,}$/.test(id)
}

/**
 * Generate a temporary ID for Archive.org movies
 */
export function generateArchiveId(identifier: string): TemporaryId {
  return `archive-${identifier}`
}

/**
 * Generate a temporary ID for YouTube videos
 */
export function generateYouTubeId(videoId: string): TemporaryId {
  return `youtube-${videoId}`
}

/**
 * Extract the original identifier from a temporary ID
 */
export function extractIdentifier(tempId: TemporaryId): string {
  if (tempId.startsWith('archive-')) {
    return tempId.slice('archive-'.length)
  }
  if (tempId.startsWith('youtube-')) {
    return tempId.slice('youtube-'.length)
  }
  return tempId
}

/**
 * OMDB search result structure
 */
export interface OMDBSearchResult {
  Title: string
  Year: string
  imdbID: string
  Type: string
  Poster: string
}

/**
 * OMDB search response
 */
export interface OMDBSearchResponse {
  Search?: OMDBSearchResult[]
  totalResults?: string
  Response: string
  Error?: string
}

/**
 * Match confidence levels for OMDB matching
 */
export enum MatchConfidence {
  EXACT = 'exact',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  NONE = 'none',
}

/**
 * Result of OMDB matching attempt
 */
export interface MatchResult {
  confidence: MatchConfidence
  imdbId?: string
  title?: string
  year?: string
  metadata?: MovieMetadata
}
