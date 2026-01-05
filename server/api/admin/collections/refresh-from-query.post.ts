import { defineEventHandler, readBody, createError } from 'h3'
import { loadCollectionsDatabase, saveCollectionsDatabase } from '../../../utils/collections'
import { executeSavedQuery } from '../../../utils/queryRefresh'
import type { Collection } from '../../../../shared/types/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { collectionId } = body

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId is required',
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

    if (!collection.savedQueries || collection.savedQueries.length === 0) {
      return {
        success: true,
        message: 'No saved queries to refresh from',
        movieCount: collection.movieIds.length,
      }
    }

    const allMovieIds = new Set<string>()

    for (const savedQuery of collection.savedQueries) {
      const matchedIds = await executeSavedQuery(savedQuery.searchQuery, savedQuery.filterState)
      matchedIds.forEach(id => allMovieIds.add(id))
    }

    collection.movieIds = Array.from(allMovieIds)
    collection.updatedAt = new Date().toISOString()

    await saveCollectionsDatabase(db)

    return {
      success: true,
      movieCount: collection.movieIds.length,
    }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to refresh collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
