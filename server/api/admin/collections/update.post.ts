import { defineEventHandler, readBody, createError } from 'h3'
import { getCollectionById, upsertCollection } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { id, name, description } = body

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID is required',
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

    if (name) collection.name = name
    if (description !== undefined) collection.description = description
    collection.updatedAt = new Date().toISOString()

    await upsertCollection(collection)
    return { success: true, collection }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
