import { defineEventHandler, readBody, createError } from 'h3'
import { removeMovieFromCollection } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { collectionId, movieId } = body

  if (!collectionId || !movieId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId and movieId are required',
    })
  }

  try {
    const success = await removeMovieFromCollection(collectionId, movieId)
    return { success }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to remove movie from collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
