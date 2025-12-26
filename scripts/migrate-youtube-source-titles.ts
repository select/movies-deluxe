import { loadMoviesDatabase, saveMoviesDatabase } from '../server/utils/movieData'
import { createLogger } from '../server/utils/logger'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('MigrateYT')

async function migrate() {
  logger.info('Starting YouTube source title migration...')
  const db = await loadMoviesDatabase()
  let count = 0

  for (const [id, entry] of Object.entries(db)) {
    if (id.startsWith('_')) continue
    const movie = entry as MovieEntry

    for (const source of movie.sources) {
      if (source.type === 'youtube' && !source.title) {
        // Use top-level title as fallback
        source.title = Array.isArray(movie.title) ? movie.title[0] : movie.title
        count++
      }
    }
  }

  if (count > 0) {
    logger.info(`Migrated ${count} YouTube sources. Saving database...`)
    await saveMoviesDatabase(db)
    logger.success('Migration completed successfully!')
  } else {
    logger.info('No YouTube sources needed migration.')
  }
}

migrate().catch(err => {
  logger.error('Migration failed:', err)
  process.exit(1)
})
