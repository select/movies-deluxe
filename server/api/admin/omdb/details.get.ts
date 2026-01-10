/**
 * Transform OMDB API response to MovieMetadata with proper types
 */
function transformOMDBResponse(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    imdbRating:
      data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : undefined,
    imdbVotes:
      data.imdbVotes && data.imdbVotes !== 'N/A'
        ? parseInt(data.imdbVotes.replace(/,/g, ''), 10)
        : undefined,
  }
}

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

    // Transform the response to convert string ratings/votes to numbers
    return transformOMDBResponse(response)
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `OMDB API request failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
