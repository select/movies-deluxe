/**
 * Migrate YouTube sources from videoId to id field
 *
 * Old structure: { type: 'youtube', videoId: 'abc123', ... }
 * New structure: { type: 'youtube', id: 'abc123', ... }
 */

import { loadMoviesDatabase, saveMoviesDatabase } from '../server/utils/movieData'
import { createLogger } from '../server/utils/logger'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('VideoIdMigration')

async function migrateVideoIdField() {
  logger.info('Starting videoId to id migration...')

  // Load database
  const db = await loadMoviesDatabase()
  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  logger.info(`Processing ${movies.length} movies`)

  let migratedCount = 0
  let skippedCount = 0

  for (const movie of movies) {
    let movieModified = false

    for (const source of movie.sources) {
      if (source.type === 'youtube') {
        const ytSource = source as any

        // Check if videoId exists and id doesn't
        if (ytSource.videoId && !ytSource.id) {
          // Migrate videoId to id
          ytSource.id = ytSource.videoId
          delete ytSource.videoId
          movieModified = true
          migratedCount++
        } else if (ytSource.videoId && ytSource.id) {
          // Both exist - remove videoId if they match
          if (ytSource.videoId === ytSource.id) {
            delete ytSource.videoId
            movieModified = true
            skippedCount++
          } else {
            logger.warn(
              `Movie ${movie.imdbId} has mismatched id (${ytSource.id}) and videoId (${ytSource.videoId})`
            )
          }
        } else if (ytSource.videoId) {
          // Only videoId exists, no id - this shouldn't happen but handle it
          delete ytSource.videoId
          skippedCount++
        }
      }
    }

    if (movieModified) {
      // Update the movie in the database
      db[movie.imdbId] = movie
    }
  }

  // Save the updated database
  await saveMoviesDatabase(db)

  logger.success(`Migration complete!`)
  logger.info(`Migrated: ${migratedCount} sources`)
  logger.info(`Cleaned up: ${skippedCount} sources`)
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]!)) {
  migrateVideoIdField().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { migrateVideoIdField }
