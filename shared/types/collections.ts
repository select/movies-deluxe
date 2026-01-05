import type { DatabaseSchema } from './movie'
import type { FilterState, SortState } from './filters'

/**
 * Saved query filter state - optimized version that omits default values
 */
export interface SavedQueryFilterState extends Omit<FilterState, 'sort'> {
  sort?: SortState // Optional to avoid storing default sort
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
