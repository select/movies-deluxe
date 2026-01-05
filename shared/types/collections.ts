import type { DatabaseSchema } from './movie'
import type { SortState } from './filters'

/**
 * Saved query filter state - optimized version that omits default values
 * All fields are optional except searchQuery to minimize storage
 */
export interface SavedQueryFilterState {
  sort?: SortState // Optional to avoid storing default sort
  sources?: string[] // Only store if non-empty
  minRating?: number // Only store if > 0
  minYear?: number // Only store if > 0
  maxYear?: number // Only store if set
  minVotes?: number // Only store if > 0
  maxVotes?: number // Only store if set
  genres?: string[] // Only store if non-empty
  countries?: string[] // Only store if non-empty
  searchQuery: string // Always store
  currentPage: number // Always store (for pagination)
  lastScrollY: number // Always store (for scroll position)
}

export interface SavedQuery {
  searchQuery: string
  filterState: SavedQueryFilterState
}

export interface Collection {
  id: string
  name: string
  description: string
  movieIds: string[]
  savedQueries?: SavedQuery[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionsDatabase {
  _schema: DatabaseSchema
  [collectionId: string]: Collection | DatabaseSchema | undefined
}
