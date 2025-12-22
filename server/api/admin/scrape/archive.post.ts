import { loadMoviesDatabase, saveMoviesDatabase } from '../../../utils/movieData'
import { scrapeArchiveOrg } from '../../../utils/archiveScraper'

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

  try {
    const db = await loadMoviesDatabase()
    const results = await scrapeArchiveOrg(db, {
      collections,
      rows,
      pages,
      skipOmdb,
      autoDetect,
      omdbApiKey,
    })
    await saveMoviesDatabase(db)
    return results
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Archive scrape failed:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Archive scrape failed',
    })
  }
})
