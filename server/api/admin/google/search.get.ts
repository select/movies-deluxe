import googleIt from 'google-it'
import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async event => {
  const { q } = getQuery(event)

  if (!q || typeof q !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required',
    })
  }

  try {
    const searchResults = await googleIt({
      query: q,
      'no-display': true,
      limit: 10,
      diagnostics: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    let results = searchResults.results
    const body = searchResults.body

    // Fallback: if google-it fails to parse (due to changed Google structure or bot detection),
    // try manual extraction of IMDB links from body
    if ((!results || results.length === 0) && body) {
      const imdbLinks = body.match(/https?:\/\/(www\.)?imdb\.com\/title\/tt\d+/g) || []
      const uniqueLinks = Array.from(new Set(imdbLinks))
      results = uniqueLinks.map(link => ({
        link,
        title: 'IMDb Result',
        snippet: '',
      }))
    }

    // Filter and format results to match OMDB search format
    const formattedResults = results
      .filter((r: any) => r.link && r.link.includes('imdb.com/title/tt'))
      .map((r: any) => {
        const imdbIdMatch = r.link.match(/tt\d+/)
        const imdbId = imdbIdMatch ? imdbIdMatch[0] : null

        // Try to extract year from title if available
        const yearMatch = r.title ? r.title.match(/\((\d{4})\)/) : null
        const year = yearMatch ? yearMatch[1] : 'N/A'

        // Clean title
        const cleanTitle =
          r.title && r.title !== 'IMDb Result'
            ? r.title
                .replace(/\s*\((\d{4})\)\s*-\s*IMDb/i, '')
                .replace(/\s*-\s*IMDb/i, '')
                .trim()
            : 'IMDb Result'

        return {
          Title: cleanTitle,
          Year: year,
          imdbID: imdbId,
          Type: 'movie',
          link: r.link,
          Snippet: r.snippet || '',
        }
      })
      .filter((r: any) => r.imdbID !== null)

    return {
      Search: formattedResults,
      totalResults: formattedResults.length.toString(),
      Response: 'True',
    }
  } catch (error: any) {
    console.error('Google search error:', error)
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error: error.message,
    }
  }
})
