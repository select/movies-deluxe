import { defineEventHandler, readBody, createError } from 'h3'
import { addMovieToCollection } from '../../../utils/collections'

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
    const success = await addMovieToCollection(collectionId, movieId)
    return { success }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add movie to collection: ${error.message}`,
    })
  }
})
