import type { DatabaseSchema } from './movie'
import type { FilterState } from './filters'

export interface SavedQuery {
  searchQuery: string
  filterState: FilterState
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
