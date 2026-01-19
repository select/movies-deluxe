import { defineEventHandler, readBody, createError } from 'h3'

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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete collection: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
