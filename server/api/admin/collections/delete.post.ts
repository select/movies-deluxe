import { defineEventHandler, readBody, createError } from 'h3'
import { deleteCollection } from '../../../utils/collections'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { id } = body

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID is required',
    })
  }

  try {
    const success = await deleteCollection(id)
    if (!success) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found',
      })
    }

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete collection: ${error.message}`,
    })
  }
})
