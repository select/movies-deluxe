import type { MoviesDatabase } from '../../shared/types/movie'

export interface ScrapeOptions {
  collections?: string[]
  onProgress?: (progress: { current: number; total: number; message: string }) => void
}

export interface ScrapeResult {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug: string[]
}

/**
 * Scrape movies from Archive.org
 * Always fetches 500 rows per page (maximum) and scrapes all pages until completion
 */
export async function scrapeArchiveOrg(
  db: MoviesDatabase,
  options: ScrapeOptions
): Promise<ScrapeResult> {
  const { collections = ['feature_films'] } = options
  const ROWS_PER_PAGE = 500 // Maximum allowed by Archive.org API

  // Build source ID index for fast lookups during scraping
  console.log('[Archive] Building source ID index...')
  buildSourceIdIndex(db)
  console.log('[Archive] Source ID index built')

  const results: ScrapeResult = {
    processed: 0,
    added: 0,
    updated: 0,
    errors: [],
    debug: [],
  }

  for (const collection of collections) {
    results.debug.push(`Starting scrape of collection: ${collection}`)
    results.debug.push(
      `Fetching ${ROWS_PER_PAGE} rows per page, scraping all pages until completion`
    )

    // Scrape all pages until no more results
    let currentCursor: string | undefined = undefined
    let pageNum = 0
    let totalFromApi = 0 // Will be set from first API response

    while (true) {
      pageNum++
      const pageMsg = `Fetching page ${pageNum} (cursor: ${currentCursor || 'start'})`
      results.debug.push(pageMsg)

      // Use totalFromApi if we have it, otherwise show processed count
      options.onProgress?.({
        current: results.processed,
        total: totalFromApi || results.processed,
        message: pageMsg,
      })

      const response = await fetchArchiveOrgMovies(collection, ROWS_PER_PAGE, currentCursor)

      // Set total from first API response
      if (pageNum === 1 && response.total) {
        totalFromApi = response.total
        results.debug.push(`Archive.org reports ${totalFromApi} total items in collection`)
      }

      const movies = response.items

      if (!movies || movies.length === 0) {
        results.debug.push(`No movies found on page ${pageNum}, stopping`)
        break
      }

      results.debug.push(`Processing ${movies.length} movies from page ${pageNum}`)

      for (const movie of movies) {
        try {
          const entry = await processArchiveMovie(movie, collection)
          if (!entry) {
            results.processed++
            continue
          }

          const existing = upsertMovie(db, entry.movieId, entry)

          results.processed++

          const progressMsg = `Processing: ${movie.title}`
          options.onProgress?.({
            current: results.processed,
            total: totalFromApi || results.processed,
            message: progressMsg,
          })

          if (!existing) {
            results.added++
            results.debug.push(`✅ Added NEW movie: ${movie.title} (${entry.movieId})`)
          } else {
            results.updated++
            results.debug.push(`🔄 Updated movie: ${movie.title} (${entry.movieId})`)
          }
        } catch (e: unknown) {
          const errorMsg = `Failed to process ${movie.title}: ${e instanceof Error ? e.message : String(e)}`
          results.errors.push(errorMsg)
          results.debug.push(`❌ ${errorMsg}`)
          results.processed++
        }
      }

      // Check if we should continue to next page
      if (!response.cursor) {
        results.debug.push(`No more pages available (no cursor), stopping`)
        break
      }

      if (movies.length < ROWS_PER_PAGE) {
        results.debug.push(
          `Received ${movies.length} items (less than ${ROWS_PER_PAGE}), likely last page`
        )
        break
      }

      currentCursor = response.cursor
    }

    results.debug.push(`Completed scraping ${collection}: processed ${results.processed} items`)
  }

  return results
}
