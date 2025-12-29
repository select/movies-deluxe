import type { DatabaseSchema } from './movie'

export interface Collection {
  id: string
  name: string
  description: string
  movieIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionsDatabase {
  _schema: DatabaseSchema
  [collectionId: string]: Collection | DatabaseSchema | undefined
}
