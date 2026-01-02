/**
 * Movie JSON Generation Script
 *
 * Splits the large public/data/movies.json into individual JSON files
 * in public/movies/[imdbId].json for on-demand loading.
 */

import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { loadMoviesDatabase } from '../server/utils/movieData'
import { createLogger } from '../server/utils/logger'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('MovieJSONGen')
const MOVIES_DIR = join(process.cwd(), 'public/movies')

async function generateMovieJSON() {
  logger.info('Starting individual movie JSON generation...')

  // 1. Ensure directory exists
  if (!existsSync(MOVIES_DIR)) {
    logger.info(`Creating directory: ${MOVIES_DIR}`)
    mkdirSync(MOVIES_DIR, { recursive: true })
  } else {
    // 2. Cleanup existing files
    logger.info('Cleaning up existing JSON files...')
    const files = readdirSync(MOVIES_DIR)
    let deletedCount = 0
    for (const file of files) {
      if (file.endsWith('.json')) {
        unlinkSync(join(MOVIES_DIR, file))
        deletedCount++
      }
    }
    logger.info(`Deleted ${deletedCount} old JSON files`)
  }

  // 3. Load JSON data
  const db = await loadMoviesDatabase()
  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  logger.info(`Processing ${movies.length} movies`)

  // 4. Write individual files
  let count = 0
  for (const movie of movies) {
    const filePath = join(MOVIES_DIR, `${movie.imdbId}.json`)
    try {
      writeFileSync(filePath, JSON.stringify(movie, null, 2))
      count++
      if (count % 1000 === 0) {
        logger.info(`Generated ${count} files...`)
      }
    } catch (err) {
      logger.error(`Failed to write JSON for movie ${movie.imdbId}:`, err)
    }
  }

  logger.success(`Successfully generated ${count} individual movie JSON files!`)
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]!)) {
  generateMovieJSON().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { generateMovieJSON }
