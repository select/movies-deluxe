import { loadCollectionsDatabase, saveCollectionsDatabase } from '../../../utils/collections'
import { loadMoviesDatabase, getSourceIdIndex } from '../../../utils/movieData'
import type { Collection } from '../../../../shared/types/collections'
import type { MovieEntry } from '../../../../shared/types/movie'

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

export default defineEventHandler(async (): Promise<CleanupResult> => {
  try {
    // Load databases
    const collectionsDb = await loadCollectionsDatabase()
    const moviesDb = await loadMoviesDatabase()

    // Build movie lookup map by IMDB ID
    const moviesByImdbId = new Map<string, MovieEntry>()

    for (const entry of Object.values(moviesDb)) {
      if (typeof entry === 'object' && entry !== null && 'imdbId' in entry) {
        const movie = entry as MovieEntry
        moviesByImdbId.set(movie.imdbId, movie)
      }
    }

    const stats = {
      collectionsProcessed: 0,
      moviesRemoved: 0,
      moviesUpdated: 0,
      collectionsModified: 0,
    }

    const details: CleanupResult['details'] = []

    // Build source ID index for fast lookups
    const sourceIdIndex = getSourceIdIndex(moviesDb)

    // Process each collection
    for (const [key, value] of Object.entries(collectionsDb)) {
      // Skip schema entry
      if (key.startsWith('_')) continue

      const collection = value as Collection
      stats.collectionsProcessed++

      const removedMovies: string[] = []
      const updatedMovies: Array<{ oldId: string; newId: string }> = []
      const newMovieIds: string[] = []

      for (const movieId of collection.movieIds) {
        // Check if movie exists by IMDB ID
        if (moviesByImdbId.has(movieId)) {
          newMovieIds.push(movieId)
          continue
        }

        // Try to find by source ID using index
        const foundMovieId = sourceIdIndex.get(movieId)
        if (foundMovieId) {
          const movieBySource = moviesDb[foundMovieId] as MovieEntry | undefined
          if (movieBySource) {
            // Movie exists but with different IMDB ID - update reference
            newMovieIds.push(movieBySource.imdbId)
            updatedMovies.push({ oldId: movieId, newId: movieBySource.imdbId })
            stats.moviesUpdated++
            continue
          }
        }

        // Movie doesn't exist - remove from collection
        removedMovies.push(movieId)
        stats.moviesRemoved++
      }

      // Update collection if changes were made
      if (removedMovies.length > 0 || updatedMovies.length > 0) {
        collection.movieIds = newMovieIds
        collection.updatedAt = new Date().toISOString()
        collectionsDb[key] = collection
        stats.collectionsModified++

        details.push({
          collectionId: collection.id,
          collectionName: collection.name,
          removedMovies,
          updatedMovies,
        })
      }
    }

    // Save updated collections if any changes were made
    if (stats.collectionsModified > 0) {
      await saveCollectionsDatabase(collectionsDb)
    }

    return {
      success: true,
      stats,
      details,
    }
  } catch (error) {
    console.error('Failed to cleanup collections:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to cleanup collections',
    })
  }
})
