import {
  loadMoviesDatabase,
  saveMoviesDatabase,
  upsertMovie,
  getDatabaseStats,
} from '../../../utils/movieData'
import { fetchArchiveOrgMovies, processArchiveMovie } from '../../../utils/archive'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const {
    collections = ['feature_films'],
    rows = 100,
    pages = 1,
    skipOmdb = false,
    autoDetect = false,
  } = body
  const omdbApiKey = process.env.OMDB_API_KEY

  const db = await loadMoviesDatabase()
  const stats = getDatabaseStats(db)

  const results = {
    processed: 0,
    added: 0,
    updated: 0,
    errors: [] as string[],
  }

  for (const collection of collections) {
    let startPage = 0
    if (autoDetect) {
      const existingInCollection = stats.collections[collection] || 0
      startPage = Math.floor(existingInCollection / rows)
    }

    for (let p = 0; p < pages; p++) {
      const currentPage = startPage + p
      const movies = await fetchArchiveOrgMovies(collection, rows, currentPage)

      if (movies.length === 0) break

      for (const movie of movies) {
        try {
          const entry = await processArchiveMovie(movie, collection, { skipOmdb, omdbApiKey })
          if (entry) {
            const existing = db[entry.imdbId]
            upsertMovie(db, entry.imdbId, entry)
            if (existing) results.updated++
            else results.added++
            results.processed++
          }
        } catch (e: unknown) {
          results.errors.push(
            `Failed to process ${movie.title}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      if (movies.length < rows) break
    }
  }

  await saveMoviesDatabase(db)
  return results
})
