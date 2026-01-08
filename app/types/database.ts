/**
 * Database Worker Types
 *
 * Type definitions for communication between the main thread and database worker.
 */

import type { GenreOption, CountryOption, ChannelOption, MovieSourceType } from '~/types'

/**
 * Base message structure for worker communication
 */
export interface WorkerMessage {
  id: string
  type: string
}

/**
 * Worker response structure
 */
export interface WorkerResponse<T = LightweightMovie[] | Collection[] | FilterOptionsResponse> {
  id: string
  error?: string
  result?: T
  totalCount?: number
  genres?: GenreOption[]
  countries?: CountryOption[]
  channels?: ChannelOption[]
}

/**
 * Lightweight movie result for list views
 */
export interface LightweightMovie {
  imdbId: string
  title: string
  year: number
  imdbRating?: string | number
  imdbVotes?: string | number
  language?: string
  sourceType?: MovieSourceType
  channelName?: string
}

/**
 * Filter options response
 */
export interface FilterOptionsResponse {
  genres: GenreOption[]
  countries: CountryOption[]
  channels: ChannelOption[]
}
