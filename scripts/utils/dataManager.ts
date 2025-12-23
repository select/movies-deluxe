/**
 * Data manager for loading, saving, and merging public/data/movies.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry } from '../../shared/types/movie'
import { createLogger } from './logger'

const logger = createLogger('DataManager')
const DATA_DIR = join(process.cwd(), 'public/data')
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

    // Merge sources (avoid duplicates, update existing)
    const existingSources = existing.sources || []
    const newSources = entry.sources || []

    const mergedSources = [...existingSources]

    for (const newSource of newSources) {
      const existingIndex = mergedSources.findIndex(
        s =>
          s.type === newSource.type &&
          ((s.type === 'archive.org' &&
            newSource.type === 'archive.org' &&
            s.identifier === newSource.identifier) ||
            (s.type === 'youtube' &&
              newSource.type === 'youtube' &&
              s.videoId === newSource.videoId))
      )

      const existingSource = mergedSources[existingIndex]
      if (existingSource) {
        // Update existing source with new data (preferring non-empty values)
        mergedSources[existingIndex] = {
          ...existingSource,
          ...newSource,
          label: newSource.label || existingSource.label,
          quality: newSource.quality || existingSource.quality,
          description: newSource.description || existingSource.description,
        }
      } else {
        // Add new source
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

  entries.forEach(([_, entry]) => {
    const movieEntry = entry as MovieEntry
    movieEntry.sources?.forEach(source => {
      if (source.type === 'archive.org') archiveOrgSources++
      if (source.type === 'youtube') youtubeSources++
    })
  })

  return {
    total: entries.length,
    matched,
    unmatched,
    archiveOrgSources,
    youtubeSources,
  }
}

/**
 * Find potential duplicate movies by title similarity
 */
export function findPotentialDuplicates(
  db: MoviesDatabase,
  threshold: number = 0.85
): Array<{ entries: MovieEntry[]; similarity: number }> {
  const entries = Object.entries(db)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, entry]) => entry as MovieEntry)

  const duplicates: Array<{ entries: MovieEntry[]; similarity: number }> = []

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const entryI = entries[i]
      const entryJ = entries[j]

      if (!entryI || !entryJ) continue

      const title1 = entryI.title.toLowerCase()
      const title2 = entryJ.title.toLowerCase()

      // Simple similarity check (can be improved with Levenshtein distance)
      const similarity = calculateSimilarity(title1, title2)

      if (similarity >= threshold) {
        duplicates.push({
          entries: [entryI, entryJ],
          similarity,
        })
      }
    }
  }

  return duplicates
}

/**
 * Calculate simple similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = getEditDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

/**
 * Calculate edit distance (Levenshtein distance)
 */
function getEditDistance(str1: string, str2: string): number {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0)
  const costs: number[] = []
  for (let i = 0; i <= str1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= str2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1] as number
        if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j] as number) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) {
      costs[str2.length] = lastValue
    }
  }
  return costs[str2.length] as number
}

/**
 * Merge two movie entries
 */
export function mergeMovieEntries(entry1: MovieEntry, entry2: MovieEntry): MovieEntry {
  // Prefer entry with real IMDB ID
  const primary = entry1.imdbId.startsWith('tt') ? entry1 : entry2
  const secondary = primary === entry1 ? entry2 : entry1

  // Merge sources
  const mergedSources = [...primary.sources]

  for (const secondarySource of secondary.sources) {
    const existingIndex = mergedSources.findIndex(
      s =>
        s.type === secondarySource.type &&
        ((s.type === 'archive.org' &&
          secondarySource.type === 'archive.org' &&
          s.identifier === secondarySource.identifier) ||
          (s.type === 'youtube' &&
            secondarySource.type === 'youtube' &&
            s.videoId === secondarySource.videoId))
    )

    const existingSource = mergedSources[existingIndex]
    if (existingIndex !== -1 && existingSource) {
      // Update existing source with new data
      mergedSources[existingIndex] = {
        ...existingSource,
        ...secondarySource,
        label: secondarySource.label || existingSource.label,
        quality: secondarySource.quality || existingSource.quality,
        description: secondarySource.description || existingSource.description,
      }
    } else {
      // Add new source
      mergedSources.push(secondarySource)
    }
  }

  return {
    ...primary,
    sources: mergedSources,
    metadata: primary.metadata || secondary.metadata,
    ai: primary.ai || secondary.ai,
    year: primary.year || secondary.year,
    lastUpdated: new Date().toISOString(),
  }
}
