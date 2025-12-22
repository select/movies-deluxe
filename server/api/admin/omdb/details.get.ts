import { defineEventHandler, getQuery, createError, getRequestHost } from 'h3'

export default defineEventHandler(async event => {
  // Security check: Only allow localhost
  const host = getRequestHost(event)
  const isLocal =
    host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('localhost:')

  if (!isLocal) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Admin APIs are only available on localhost',
    })
  }

  const query = getQuery(event)
  const id = query.i as string

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'IMDB ID (i) is required',
    })
  }

  const apiKey = process.env.OMDB_API_KEY
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OMDB API key not configured on server',
    })
  }

  try {
    const response = await $fetch('https://www.omdbapi.com/', {
      query: {
        apikey: apiKey,
        i: id,
        plot: 'full',
      },
    })

    return response
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `OMDB API request failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
