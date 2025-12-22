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
 * Add or update a movie entry in the database
 * If the movie exists, merges sources and updates metadata
 */
export function upsertMovie(db: MoviesDatabase, movieId: string, entry: MovieEntry): void {
  const existing = db[movieId] as MovieEntry | undefined

  if (existing) {
    // Movie exists - merge sources and update metadata
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

      if (existingIndex !== -1) {
        // Update existing source with new data (preferring non-empty values)
        mergedSources[existingIndex] = {
          ...mergedSources[existingIndex],
          ...newSource,
          description: newSource.description || mergedSources[existingIndex].description,
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
    db[movieId] = {
      ...entry,
      lastUpdated: new Date().toISOString(),
    }
  }
}

/**
 * Get statistics about the database
 */
export function getDatabaseStats(db: MoviesDatabase) {
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))
  const matched = entries.filter(([key]) => key.startsWith('tt')).length
  const unmatched = entries.length - matched

  const stats = {
    total: entries.length,
    matched,
    unmatched,
    archiveOrgSources: 0,
    youtubeSources: 0,
    curatedCount: 0,
    collections: {} as Record<string, number>,
  }

  entries.forEach(([_, entry]) => {
    const movieEntry = entry as MovieEntry
    movieEntry.sources?.forEach((source: MovieSource) => {
      if (source.type === 'archive.org') {
        stats.archiveOrgSources++
        if (source.collection) {
          const collection = Array.isArray(source.collection)
            ? source.collection[0]
            : source.collection
          stats.collections[collection] = (stats.collections[collection] || 0) + 1
        }
      }
      if (source.type === 'youtube') stats.youtubeSources++
    })
    // Consider curated if it has metadata and was manually updated or has high confidence
    if (
      movieEntry.metadata &&
      !movieEntry.imdbId.startsWith('archive-') &&
      !movieEntry.imdbId.startsWith('youtube-')
    ) {
      stats.curatedCount++
    }
  })

  return stats
}
