import { defineEventHandler, createError } from 'h3'
import { extractMovieKeys } from '../../../utils/movieData'

interface CleanupResult {
  success: boolean
  collectionsUpdated: number
  orphanedIdsRemoved: number
  details: Array<{
    collectionId: string
    collectionName: string
    removedIds: string[]
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
    let collectionsUpdated = 0
    let orphanedIdsRemoved = 0

    // Check each collection for orphaned IDs
    for (const [key, value] of Object.entries(db)) {
      if (key.startsWith('_')) continue

      const collection = value as Collection
      const orphanedIds = collection.movieIds.filter(id => !validMovieIds.has(id))

      if (orphanedIds.length > 0) {
        // Remove orphaned IDs
        collection.movieIds = collection.movieIds.filter(id => validMovieIds.has(id))
        collection.updatedAt = new Date().toISOString()

        details.push({
          collectionId: collection.id,
          collectionName: collection.name,
          removedIds: orphanedIds,
        })

        collectionsUpdated++
        orphanedIdsRemoved += orphanedIds.length
      }
    }

    // Save if any changes were made
    if (collectionsUpdated > 0) {
      await saveCollectionsDatabase(db)
    }

    return {
      success: true,
      collectionsUpdated,
      orphanedIdsRemoved,
      details,
    }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to cleanup collections: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
