import type { MoviesDatabase, MovieEntry } from '../../shared/types/movie'
import { fetchArchiveOrgMovies, processArchiveMovie } from './archive'
import { upsertMovie } from './movieData'

export interface ScrapeOptions {
  collections?: string[]
  rows?: number
  pages?: number
  skipOmdb?: boolean
  autoDetect?: boolean
  omdbApiKey?: string
}

export interface ScrapeResult {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug: string[]
}

/**
 * Count existing movies from a specific collection
 */
function countExistingMoviesInCollection(db: MoviesDatabase, collection: string): number {
  return Object.values(db).filter((entry: unknown) => {
    if ((entry as { _schema?: unknown })._schema) return false
    const movieEntry = entry as MovieEntry
    return movieEntry.sources?.some(
      s =>
        s.type === 'archive.org' &&
        (Array.isArray(s.collection)
          ? s.collection.includes(collection)
          : s.collection === collection)
    )
  }).length
}

/**
 * Find the first page with new movies (autodetect)
 * NOTE: Archive.org API has pagination limits - it returns the same results after ~100-200 items
 * So we always start from page 0 and skip existing movies
 */
async function findStartPage(
  db: MoviesDatabase,
  collection: string,
  rows: number,
  existingCount: number,
  debug: string[]
): Promise<number> {
  debug.push(`[AutoDetect] Collection: ${collection}, Existing: ${existingCount} movies`)
  debug.push(`⚠️  Archive.org API limitation: pagination only works for first ~100-200 results`)
  debug.push(`Starting from page 0 and skipping existing movies`)
  return 0
}

/**
 * Scrape movies from Archive.org
 */
export async function scrapeArchiveOrg(
  db: MoviesDatabase,
  options: ScrapeOptions
): Promise<ScrapeResult> {
  const {
    collections = ['feature_films'],
    rows = 100,
    pages = 1,
    skipOmdb = false,
    autoDetect = false,
    omdbApiKey,
  } = options

  const results: ScrapeResult = {
    processed: 0,
    added: 0,
    updated: 0,
    errors: [],
    debug: [],
  }

  for (const collection of collections) {
    let startPage = 0

    if (autoDetect) {
      const existingCount = countExistingMoviesInCollection(db, collection)
      const foundPage = await findStartPage(db, collection, rows, existingCount, results.debug)
      startPage = foundPage
    }

    // Scrape the requested pages
    for (let p = 0; p < pages; p++) {
      const currentPage = startPage + p
      results.debug.push(`Fetching page ${currentPage} (${rows} rows)`)
      const movies = await fetchArchiveOrgMovies(collection, rows, currentPage)

      if (movies.length === 0) {
        results.debug.push(`No movies found on page ${currentPage}, stopping`)
        break
      }

      for (const movie of movies) {
        try {
          const entry = await processArchiveMovie(movie, collection, { skipOmdb, omdbApiKey })
          if (!entry) continue

          const existing = db[entry.imdbId] as MovieEntry | undefined
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
            results.debug.push(`✅ Added NEW movie: ${movie.title} (${entry.imdbId})`)
          } else if (!existingSource) {
            results.updated++
            results.debug.push(`🔄 Updated movie with new source: ${movie.title} (${entry.imdbId})`)
          } else {
            results.debug.push(`⏭️  Skipped existing: ${movie.title} (${entry.imdbId})`)
          }
        } catch (e: unknown) {
          const errorMsg = `Failed to process ${movie.title}: ${e instanceof Error ? e.message : String(e)}`
          results.errors.push(errorMsg)
          results.debug.push(`❌ ${errorMsg}`)
        }
      }

      if (movies.length < rows) {
        results.debug.push(
          `Received fewer movies than requested (${movies.length} < ${rows}), stopping`
        )
        break
      }
    }
  }

  return results
}
