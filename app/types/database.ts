/**
 * Database Worker Types
 *
 * Type definitions for communication between the main thread and database worker.
 */

import type { GenreOption, CountryOption, ChannelOption, LightweightMovie } from '~/types'

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
  count?: number
  genres?: GenreOption[]
  countries?: CountryOption[]
  channels?: ChannelOption[]
  success?: boolean
  totalMovies?: number
}

/**
 * Filter options response
 */
export interface FilterOptionsResponse {
  genres: GenreOption[]
  countries: CountryOption[]
  channels: ChannelOption[]
}
