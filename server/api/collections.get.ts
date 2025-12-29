import { defineEventHandler } from 'h3'
import { getCollections } from '../utils/collections'

export default defineEventHandler(async () => {
  try {
    return await getCollections()
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load collections',
    })
  }
})
