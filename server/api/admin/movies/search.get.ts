import { defineEventHandler, getQuery } from 'h3'
import { loadMoviesDatabase } from '../../../utils/movieData'

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const q = ((query.q as string) || '').toLowerCase().trim()

  if (!q) {
    return []
  }

  const db = await loadMoviesDatabase()
  const results: any[] = []

  for (const [key, value] of Object.entries(db)) {
    if (key.startsWith('_')) continue
    const entry = value as MovieEntry

    const searchFields = [
      entry.title,
      entry.metadata?.Director,
      entry.metadata?.Writer,
      entry.metadata?.Actors,
      entry.metadata?.Plot,
      entry.imdbId,
    ].filter(Boolean) as string[]

    const matches = searchFields.some(field => field.toLowerCase().includes(q))

    if (matches) {
      // Return only necessary fields for the search result list
      results.push({
        imdbId: entry.imdbId,
        title: entry.title,
        year: entry.year,
        metadata: {
          Poster: entry.metadata?.Poster,
          Director: entry.metadata?.Director,
          Writer: entry.metadata?.Writer,
          Plot: entry.metadata?.Plot,
        },
      })
    }
  }

  // Sort by title and limit to 50 results
  return results.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 50)
})
