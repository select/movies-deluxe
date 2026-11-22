import { defineEventHandler, getQuery, createError } from 'h3'
import { searchGoogleForImdb } from '#server/utils/googleSearch'

export default defineEventHandler(async event => {
  const { q } = getQuery(event)

  if (!q || typeof q !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required',
    })
  }

  return await searchGoogleForImdb(q)
})
