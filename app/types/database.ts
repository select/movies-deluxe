/**
 * Database Worker Types
 *
 * Type definitions for communication between the main thread and database worker.
 */

import type {
  GenreOption,
  CountryOption,
  ChannelOption,
  LightweightMovie,
  Collection,
} from '~/types'

/**
 * Vector search result with distance
 */
export interface VectorSearchResult extends LightweightMovie {
  distance: number
}

/**
 * Base worker response with common fields
 */
interface WorkerResponseBase {
  id: string
}

/**
 * Error response from worker
 */
interface WorkerErrorResponse extends WorkerResponseBase {
  error: string
}

/**
 * Successful init response
 */
interface WorkerInitResponse extends WorkerResponseBase {
  totalMovies: number
}

/**
 * Query result response (movies, collections, etc.)
 */
interface WorkerQueryResponse extends WorkerResponseBase {
  result: LightweightMovie[] | Collection[] | VectorSearchResult[] | Record<string, unknown>[]
  totalCount?: number
  count?: number
}

/**
 * Filter options response from worker
 */
interface WorkerFilterOptionsResponse extends WorkerResponseBase {
  genres: GenreOption[]
  countries: CountryOption[]
  channels: ChannelOption[]
}

/**
 * Generic success response
 */
interface WorkerSuccessResponse extends WorkerResponseBase {
  success: boolean
}

/**
 * Embeddings attach response
 */
interface WorkerAttachEmbeddingsResponse extends WorkerResponseBase {
  embeddingsCount: number
}

/**
 * Worker response - discriminated union of all response types
 * Use type guards or check specific fields to narrow the type
 */
export type WorkerResponse =
  | WorkerErrorResponse
  | WorkerInitResponse
  | WorkerQueryResponse
  | WorkerFilterOptionsResponse
  | WorkerSuccessResponse
  | WorkerAttachEmbeddingsResponse

/**
 * Filter options response structure
 */
export interface FilterOptionsResponse {
  genres: GenreOption[]
  countries: CountryOption[]
  channels: ChannelOption[]
}
