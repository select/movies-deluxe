import { loadMoviesDatabase, saveMoviesDatabase, upsertMovie } from '../../../utils/movieData'
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

  const results = {
    processed: 0,
    added: 0,
    updated: 0,
    errors: [] as string[],
  }

  for (const collection of collections) {
    let startPage = 0
    if (autoDetect) {
      // Find the first page with new movies by binary search
      // Check pages 0, 5, 10, 15, 20 to find approximate starting point
      const testPages = [0, 5, 10, 15, 20, 25, 30]
      let lastPageWithAllExisting = -1

      for (const testPage of testPages) {
        const testMovies = await fetchArchiveOrgMovies(collection, Math.min(rows, 5), testPage)
        if (testMovies.length === 0) break

        // Check if all movies on this page already exist
        const allExist = testMovies.every(movie => {
          const tempId = `archive-${movie.identifier}`
          const existing = db[tempId]
          if (!existing) return false
          // Check if this specific source exists
          const hasSource = existing.sources?.some(
            s => s.type === 'archive.org' && s.identifier === movie.identifier
          )
          return hasSource
        })

        if (allExist) {
          lastPageWithAllExisting = testPage
        } else {
          // Found a page with new movies
          startPage = testPage
          break
        }
      }

      // If all test pages have existing movies, start after the last one
      if (lastPageWithAllExisting >= 0 && startPage === 0) {
        startPage = lastPageWithAllExisting + 1
      }
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
            const existingSource = existing?.sources?.find(
              s =>
                s.type === 'archive.org' &&
                entry.sources?.[0]?.type === 'archive.org' &&
                s.identifier === entry.sources[0].identifier
            )

            upsertMovie(db, entry.imdbId, entry)
            results.processed++

            if (!existing) {
              results.added++
            } else if (!existingSource) {
              // Movie exists but this is a new source
              results.updated++
            }
            // If movie and source both exist, don't count as updated
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
