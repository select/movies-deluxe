import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async event => {
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
