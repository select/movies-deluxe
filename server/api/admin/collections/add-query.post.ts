import { defineEventHandler, readBody, createError } from 'h3'
import { addQueryToCollection } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { collectionId, query } = body

  if (!collectionId || !query) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId and query are required',
    })
  }

  try {
    const success = await addQueryToCollection(collectionId, query)
    return { success }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add query to collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
