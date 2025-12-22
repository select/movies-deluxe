import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry, MovieSource } from '../../types/movie'

const DATA_DIR = join(process.cwd(), 'public/data')
const MOVIES_FILE = join(DATA_DIR, 'movies.json')

/**
 * Load the movies database from disk
 */
export async function loadMoviesDatabase(): Promise<MoviesDatabase> {
  try {
    if (!existsSync(MOVIES_FILE)) {
      return createEmptyDatabase()
    }

    const content = await readFile(MOVIES_FILE, 'utf-8')
    return JSON.parse(content) as MoviesDatabase
  } catch (error) {
    console.error('Failed to load movies database:', error)
    throw error
  }
}

/**
 * Save the movies database to disk
 */
export async function saveMoviesDatabase(db: MoviesDatabase): Promise<void> {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true })
    }

    db._schema.lastUpdated = new Date().toISOString()
    const content = JSON.stringify(db, null, 2)
    await writeFile(MOVIES_FILE, content, 'utf-8')
  } catch (error) {
    console.error('Failed to save movies database:', error)
    throw error
  }
}

function createEmptyDatabase(): MoviesDatabase {
  return {
    _schema: {
      version: '1.0.0',
      description: 'Centralized movie database indexed by imdbId.',
      lastUpdated: new Date().toISOString(),
    },
  }
}

/**
 * Get statistics about the database
 */
export function getDatabaseStats(db: MoviesDatabase) {
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))
  const matched = entries.filter(([key]) => key.startsWith('tt')).length
  const unmatched = entries.length - matched

  let archiveOrgSources = 0
  let youtubeSources = 0
  let curatedCount = 0

  entries.forEach(([_, entry]) => {
    const movieEntry = entry as MovieEntry
    movieEntry.sources?.forEach((source: MovieSource) => {
      if (source.type === 'archive.org') archiveOrgSources++
      if (source.type === 'youtube') youtubeSources++
    })
    // Consider curated if it has metadata and was manually updated or has high confidence
    if (
      movieEntry.metadata &&
      !movieEntry.imdbId.startsWith('archive-') &&
      !movieEntry.imdbId.startsWith('youtube-')
    ) {
      curatedCount++
    }
  })

  return {
    total: entries.length,
    matched,
    unmatched,
    archiveOrgSources,
    youtubeSources,
    curatedCount,
  }
}
