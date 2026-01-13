/**
 * Centralized Movie Data Types
 *
 * This file defines the TypeScript interfaces for the centralized movie database
 * stored in data/movies.json. Movies are indexed by imdbId or temporary IDs.
 */

/**
 * Source types for movie streaming locations
 */
export type MovieSourceType = 'archive.org' | 'youtube'

/**
 * YouTube region restriction data
 */
export interface YouTubeRegionRestriction {
  allowed?: string[] // List of region codes where the video is viewable (ISO 3166-1 alpha-2)
  blocked?: string[] // List of region codes where the video is blocked (ISO 3166-1 alpha-2)
}

/**
 * Base interface for all movie sources
 */
export interface MovieSource {
  type: MovieSourceType
  url: string
  id: string // Archive.org identifier or YouTube video ID
  title: string // Original title from the source (before cleaning/processing)
  description?: string // Original source description (e.g., YouTube description)
  label?: string // Custom label for this source (e.g. "Director's Cut")
  quality?: string // Quality info (e.g. "1080p", "SD")
  qualityMarks?: string[] // Quality marks for this source (e.g., "low-quality", "cam-rip", "hardcoded-subs")
  fileSize?: number // File size in bytes
  size?: number // Legacy Archive.org file size (alias for fileSize)
  addedAt: string // ISO 8601 timestamp
  thumbnail?: string
  duration?: number // Duration in seconds
  language?: string | string[] // Language code(s) (e.g., 'en', 'es')
  year?: number // Unified release year
  releaseYear?: number // Legacy YouTube release year (alias for year)

  // Archive.org specific
  collection?: string // e.g., 'feature_films'
  downloads?: number

  // YouTube specific
  channelName?: string
  channelId?: string
  publishedAt?: string
  viewCount?: number
  regionRestriction?: YouTubeRegionRestriction // Geographic restrictions
}

/**
 * Archive.org specific source data (for type safety when needed)
 */
export interface ArchiveOrgSource extends MovieSource {
  type: 'archive.org'
}

/**
 * YouTube specific source data (for type safety when needed)
 */
export interface YouTubeSource extends MovieSource {
  type: 'youtube'
  channelName: string // Required for YouTube
}

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
  imdbRating?: number
  imdbVotes?: number
  imdbID?: string
  Type?: string
  DVD?: string
  BoxOffice?: string
  Production?: string
  Website?: string
  Response?: string
}

/**
 * AI-extracted metadata from Ollama
 * Used to store cleaned movie titles and years extracted from promotional/messy source titles
 */
export interface AIMetadata {
  title?: string // Cleaned movie title extracted by AI
  year?: number // Release year extracted by AI
}

/**
 * Quality labels for marking low-quality or problematic content
 */
export enum QualityLabel {
  CLIP = 'clip',
  TEASER = 'teaser',
  TRAILER = 'trailer',
  PROMO = 'promo',
  BEHIND_THE_SCENES = 'behind-the-scenes',
  INTERVIEW = 'interview',
  DUPLICATE = 'duplicate',
  INCORRECT = 'incorrect',
  INCOMPLETE = 'incomplete',
  ADULT = 'adult',
  BLOCKED = 'blocked', // YouTube videos unavailable due to geographic restrictions or privacy settings
}

/**
 * Quality marks for individual sources
 */
export enum SourceQualityMark {
  LOW_QUALITY = 'low-quality',
  CAM_RIP = 'cam-rip',
  HARDCODED_SUBS = 'hardcoded-subs',
  AUDIO_ISSUES = 'audio-issues',
  VIDEO_ISSUES = 'video-issues',
  INCOMPLETE = 'incomplete',
  WRONG_ASPECT_RATIO = 'wrong-aspect-ratio',
}

/**
 * Lightweight movie entry with only essential data for virtual scrolling
 * Used for initial load to minimize memory usage and for grid display
 */
export interface LightweightMovie {
  imdbId: string
  title: string
  year?: number
  imdbRating?: number
  imdbVotes?: number
  language?: string
  sourceType?: MovieSourceType
  channelName?: string
  verified?: boolean
  lastUpdated?: string
  genre?: string
  country?: string
  distance?: number // Distance for vector search results
}

/**
 * Main movie entry structure
 */
export interface MovieEntry {
  imdbId: string // IMDB ID (e.g., 'tt0012345') or temporary ID (e.g., 'archive-xyz', 'youtube-abc')
  title: string
  year?: number
  sources: MovieSource[]
  metadata?: MovieMetadata
  verified?: boolean // Whether this entry has been manually verified by a human
  ai?: AIMetadata // AI-extracted metadata from Ollama (for unmatched movies with promotional titles)
  lastUpdated: string // ISO 8601 timestamp
  relatedMovies?: string[]
  collections?: Array<{
    id: string
    name: string
  }>
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
