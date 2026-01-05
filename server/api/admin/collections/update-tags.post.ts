import { defineEventHandler, readBody, createError } from 'h3'
import { updateCollectionTags } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { collectionId, tags } = body

  if (!collectionId || !Array.isArray(tags)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId and tags (array) are required',
    })
  }

  try {
    const success = await updateCollectionTags(collectionId, tags)
    return { success }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update collection tags: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
