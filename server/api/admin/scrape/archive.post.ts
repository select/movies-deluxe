export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { collections = ['feature_films'], rows = 100, pages = 1, autoDetect = false } = body

  try {
    const db = await loadMoviesDatabase()
    const results = await scrapeArchiveOrg(db, {
      collections,
      rows,
      pages,
      autoDetect,
      onProgress: progress => {
        emitProgress({
          type: 'archive',
          status: 'in_progress',
          ...progress,
        })
      },
    })
    await saveMoviesDatabase(db)

    emitProgress({
      type: 'archive',
      status: 'completed',
      current: results.processed,
      total: results.processed,
      message: 'Archive.org scrape completed',
    })

    return results
  } catch (error) {
    console.error('Archive scrape failed:', error)

    emitProgress({
      type: 'archive',
      status: 'error',
      current: 0,
      total: 0,
      message: error instanceof Error ? error.message : 'Archive scrape failed',
    })

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Archive scrape failed',
    })
  }
})
