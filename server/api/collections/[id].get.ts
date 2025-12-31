import { defineEventHandler, createError } from 'h3'
import { getCollectionById } from '../../utils/collections'
import { loadMoviesDatabase } from '../../utils/movieData'

export default defineEventHandler(async event => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required',
    })
  }

  try {
    const collection = await getCollectionById(id)
    if (!collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found',
      })
    }

    // Load movies to include details
    const moviesDb = await loadMoviesDatabase()
    const movies: MovieEntry[] = []

    for (const movieId of collection.movieIds) {
      const movie = moviesDb[movieId] as MovieEntry | undefined
      if (movie) {
        movies.push(movie)
      }
    }

    return {
      ...collection,
      movies,
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
