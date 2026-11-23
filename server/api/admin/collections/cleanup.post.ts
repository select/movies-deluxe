import { defineEventHandler, createError } from 'h3'
import { extractMovieKeys } from '../../../utils/movieData'
import { loadCollectionsDatabase, saveCollectionsDatabase } from '#server/utils/collections'
import type { Collection } from '#shared/types/collections'

interface CleanupResult {
  success: boolean
  stats: {
    collectionsProcessed: number
    moviesRemoved: number
    moviesUpdated: number
    collectionsModified: number
  }
  details: Array<{
    collectionId: string
    collectionName: string
    removedMovies: string[]
    updatedMovies: Array<{ oldId: string; newId: string }>
  }>
}

/**
 * Cleanup endpoint to remove orphaned movie IDs from collections.
 * Orphaned IDs are movie references that no longer exist in the database.
 */
export default defineEventHandler(async (): Promise<CleanupResult> => {
  try {
    // Get all valid movie IDs from the database
    const validMovieIds = new Set(await extractMovieKeys('all'))

    // Load all collections
    const db = await loadCollectionsDatabase()
    const details: CleanupResult['details'] = []
    let collectionsProcessed = 0
    let collectionsModified = 0
    let moviesRemoved = 0

    // Check each collection for orphaned IDs
    for (const [key, value] of Object.entries(db)) {
      if (key.startsWith('_')) continue

      collectionsProcessed++
      const collection = value as Collection
      const orphanedIds = collection.movieIds.filter(id => !validMovieIds.has(id))

      if (orphanedIds.length > 0) {
        // Remove orphaned IDs
        collection.movieIds = collection.movieIds.filter(id => validMovieIds.has(id))
        collection.updatedAt = new Date().toISOString()

        details.push({
          collectionId: collection.id,
          collectionName: collection.name,
          removedMovies: orphanedIds,
          updatedMovies: [],
        })

        collectionsModified++
        moviesRemoved += orphanedIds.length
      }
    }

    // Save if any changes were made
    if (collectionsModified > 0) {
      await saveCollectionsDatabase(db)
    }

    return {
      success: true,
      stats: {
        collectionsProcessed,
        moviesRemoved,
        moviesUpdated: 0,
        collectionsModified,
      },
      details,
    }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to cleanup collections: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
