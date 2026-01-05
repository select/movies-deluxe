import { defineEventHandler, readBody, createError } from 'h3'
import { loadCollectionsDatabase, saveCollectionsDatabase } from '../../../utils/collections'
import type { Collection, SavedQuery } from '../../../../shared/types/collections'

interface UpdatePayload {
  collectionId: string
  updates: {
    name?: string
    description?: string
    tags?: { action: 'set' | 'add' | 'remove'; values: string[] }
    queries?: { action: 'add' | 'remove' | 'update'; index?: number; query?: SavedQuery }
    movies?: { action: 'add' | 'remove'; movieIds: string[] }
  }
}

export default defineEventHandler(async event => {
  const body = (await readBody(event)) as UpdatePayload
  const { collectionId, updates } = body

  if (!collectionId || !updates) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId and updates are required',
    })
  }

  try {
    const db = await loadCollectionsDatabase()
    const collection = db[collectionId] as Collection | undefined

    if (!collection || 'version' in collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found',
      })
    }

    // 1. Metadata updates
    if (updates.name !== undefined) collection.name = updates.name
    if (updates.description !== undefined) collection.description = updates.description

    // 2. Tag updates
    if (updates.tags) {
      const { action, values } = updates.tags
      if (!collection.tags) collection.tags = []

      if (action === 'set') {
        collection.tags = values
      } else if (action === 'add') {
        values.forEach(tag => {
          if (!collection.tags!.includes(tag)) collection.tags!.push(tag)
        })
      } else if (action === 'remove') {
        collection.tags = collection.tags.filter(tag => !values.includes(tag))
      }
    }

    // 3. Query updates
    if (updates.queries) {
      const { action, index, query } = updates.queries
      if (!collection.savedQueries) collection.savedQueries = []

      if (action === 'add' && query) {
        collection.savedQueries.push(query)
      } else if (action === 'remove' && typeof index === 'number') {
        if (index >= 0 && index < collection.savedQueries.length) {
          collection.savedQueries.splice(index, 1)
        }
      } else if (action === 'update' && typeof index === 'number' && query) {
        if (index >= 0 && index < collection.savedQueries.length) {
          collection.savedQueries[index] = query
        }
      }
    }

    // 4. Movie updates
    if (updates.movies) {
      const { action, movieIds } = updates.movies
      if (action === 'add') {
        movieIds.forEach(id => {
          if (!collection.movieIds.includes(id)) collection.movieIds.push(id)
        })
      } else if (action === 'remove') {
        collection.movieIds = collection.movieIds.filter(id => !movieIds.includes(id))
      }
    }

    collection.updatedAt = new Date().toISOString()
    await saveCollectionsDatabase(db)

    return { success: true, collection }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
