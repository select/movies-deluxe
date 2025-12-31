import { defineEventHandler, readBody, createError } from 'h3'
import { upsertCollection } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { id, name, description } = body

  if (!id || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID and name are required',
    })
  }

  try {
    const now = new Date().toISOString()
    const collection: Collection = {
      id,
      name,
      description: description || '',
      movieIds: [],
      createdAt: now,
      updatedAt: now,
    }

    await upsertCollection(collection)
    return { success: true, collection }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
