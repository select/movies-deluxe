/**
 * Data manager for loading, saving, and merging movies.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry } from '../../types/movie.ts'
import { createLogger } from './logger.ts'

const logger = createLogger('DataManager')
const DATA_DIR = join(process.cwd(), 'data')
const MOVIES_FILE = join(DATA_DIR, 'movies.json')

/**
 * Load the movies database from disk
 */
export async function loadMoviesDatabase(): Promise<MoviesDatabase> {
  try {
    if (!existsSync(MOVIES_FILE)) {
      logger.warn('movies.json not found, creating new database')
      return createEmptyDatabase()
    }

    const content = await readFile(MOVIES_FILE, 'utf-8')
    const db = JSON.parse(content) as MoviesDatabase
    logger.info(
      `Loaded ${Object.keys(db).filter(k => !k.startsWith('_')).length} movies from database`
    )
    return db
  } catch (error) {
    logger.error('Failed to load movies database:', error)
    throw error
  }
}

/**
 * Save the movies database to disk
 */
export async function saveMoviesDatabase(db: MoviesDatabase): Promise<void> {
  try {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true })
    }

    // Update schema timestamp
    db._schema.lastUpdated = new Date().toISOString()

    // Write with pretty formatting
    const content = JSON.stringify(db, null, 2)
    await writeFile(MOVIES_FILE, content, 'utf-8')

    const movieCount = Object.keys(db).filter(k => !k.startsWith('_')).length
    logger.success(`Saved ${movieCount} movies to database`)
  } catch (error) {
    logger.error('Failed to save movies database:', error)
    throw error
  }
}

/**
 * Create an empty database with schema
 */
function createEmptyDatabase(): MoviesDatabase {
  return {
    _schema: {
      version: '1.0.0',
      description:
        'Centralized movie database indexed by imdbId. Temporary IDs use format "archive-{identifier}" or "youtube-{videoId}" until OMDB matching succeeds.',
      lastUpdated: new Date().toISOString(),
    },
  }
}

/**
 * Add or update a movie entry in the database
 * If the movie exists, merges sources and updates metadata
 */
export function upsertMovie(db: MoviesDatabase, movieId: string, entry: MovieEntry): void {
  const existing = db[movieId] as MovieEntry | undefined

  if (existing) {
    // Movie exists - merge sources and update metadata
    logger.debug(`Updating existing movie: ${movieId}`)

    // Merge sources (avoid duplicates)
    const existingSources = existing.sources || []
    const newSources = entry.sources || []

    const mergedSources = [...existingSources]
    for (const newSource of newSources) {
      const isDuplicate = existingSources.some(
        s =>
          s.type === newSource.type &&
          ((s.type === 'archive.org' &&
            newSource.type === 'archive.org' &&
            s.identifier === newSource.identifier) ||
            (s.type === 'youtube' &&
              newSource.type === 'youtube' &&
              s.videoId === newSource.videoId))
      )

      if (!isDuplicate) {
        mergedSources.push(newSource)
      }
    }

    // Update entry
    db[movieId] = {
      ...existing,
      ...entry,
      sources: mergedSources,
      metadata: entry.metadata || existing.metadata,
      lastUpdated: new Date().toISOString(),
    }
  } else {
    // New movie - add it
    logger.debug(`Adding new movie: ${movieId}`)
    db[movieId] = {
      ...entry,
      lastUpdated: new Date().toISOString(),
    }
  }
}

/**
 * Migrate a movie from a temporary ID to an IMDB ID
 * Merges data if the IMDB ID already exists
 */
export function migrateMovieId(db: MoviesDatabase, oldId: string, newId: string): void {
  const oldEntry = db[oldId] as MovieEntry | undefined

  if (!oldEntry) {
    logger.warn(`Cannot migrate: movie ${oldId} not found`)
    return
  }

  logger.info(`Migrating movie from ${oldId} to ${newId}`)

  // Update the imdbId in the entry
  oldEntry.imdbId = newId

  // Add/merge to new ID
  upsertMovie(db, newId, oldEntry)

  // Remove old entry
  delete db[oldId]
}

/**
 * Get all movies with temporary IDs (not yet matched to IMDB)
 */
export function getUnmatchedMovies(db: MoviesDatabase): MovieEntry[] {
  return Object.entries(db)
    .filter(([key]) => !key.startsWith('_') && !key.startsWith('tt'))
    .map(([_, entry]) => entry as MovieEntry)
}

/**
 * Get statistics about the database
 */
export function getDatabaseStats(db: MoviesDatabase): {
  total: number
  matched: number
  unmatched: number
  archiveOrgSources: number
  youtubeSources: number
} {
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))

  const matched = entries.filter(([key]) => key.startsWith('tt')).length
  const unmatched = entries.length - matched

  let archiveOrgSources = 0
  let youtubeSources = 0

  for (const [_, entry] of entries) {
    const movieEntry = entry as MovieEntry
    for (const source of movieEntry.sources || []) {
      if (source.type === 'archive.org') archiveOrgSources++
      if (source.type === 'youtube') youtubeSources++
    }
  }

  return {
    total: entries.length,
    matched,
    unmatched,
    archiveOrgSources,
    youtubeSources,
  }
}
