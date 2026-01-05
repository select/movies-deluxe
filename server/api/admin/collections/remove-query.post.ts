import { defineEventHandler, readBody, createError } from 'h3'
import { removeQueryFromCollection } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { collectionId, queryIndex } = body

  if (!collectionId || typeof queryIndex !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId and queryIndex are required',
    })
  }

  try {
    const success = await removeQueryFromCollection(collectionId, queryIndex)
    return { success }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to remove query from collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
