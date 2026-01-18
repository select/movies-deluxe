import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async event => {
  const { q } = getQuery(event)
  const config = useRuntimeConfig()

  if (!q || typeof q !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required',
    })
  }

  const apiKey = config.googleApiKey
  const cx = config.googleSearchCx

  if (!apiKey || !cx) {
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error:
        'Google Search API not configured. Please set GOOGLE_API_KEY and GOOGLE_SEARCH_CX in .env',
    }
  }

  try {
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
    searchUrl.searchParams.append('key', apiKey)
    searchUrl.searchParams.append('cx', cx)
    searchUrl.searchParams.append('q', q)
    searchUrl.searchParams.append('num', '10')

    const response = await fetch(searchUrl.toString())
    const data = (await response.json()) as {
      error?: { message?: string }
      items?: Array<{
        link: string
        title?: string
        snippet?: string
      }>
    }

    if (data.error) {
      throw new Error(data.error.message || 'Google API Error')
    }

    const items = data.items || []

    // Filter and format results to match OMDB search format
    const formattedResults = items
      .filter(r => r.link && r.link.includes('imdb.com/title/tt'))
      .map(r => {
        const movieIdMatch = r.link.match(/tt\d+/)
        const movieId = movieIdMatch ? movieIdMatch[0] : null

        // Try to extract year from title or snippet if available
        const yearMatch = (r.title + ' ' + r.snippet).match(/\((\d{4})\)/)
        const year = yearMatch ? yearMatch[1] : 'N/A'

        // Clean title
        const cleanTitle = r.title
          ? r.title
              .replace(/\s*\((\d{4})\)\s*-\s*IMDb/i, '')
              .replace(/\s*-\s*IMDb/i, '')
              .trim()
          : 'IMDb Result'

        return {
          Title: cleanTitle,
          Year: year,
          imdbID: movieId,
          Type: 'movie',
          link: r.link,
          Snippet: r.snippet || '',
        }
      })
      .filter(r => r.imdbID !== null)

    // Deduplicate by imdbID
    const uniqueResults = Array.from(
      new Map(formattedResults.map(item => [item.imdbID, item])).values()
    )

    return {
      Search: uniqueResults,
      totalResults: uniqueResults.length.toString(),
      Response: 'True',
    }
  } catch (error: unknown) {
    console.error('Google search error:', error)
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error: error instanceof Error ? error.message : String(error),
    }
  }
})
