/**
 * Movie Helper Functions for SQLite Operations
 *
 * This module provides reusable functions for common movie database operations
 * using the admin SQLite database. All functions use prepared statements for
 * performance and proper error handling.
 *
 * Organization:
 * - Movie Queries: Fetch movie data
 * - Source Operations: Manage movie sources
 * - Metadata Operations: Handle movie metadata
 * - Quality Operations: Manage quality labels
 * - Collection Operations: Handle movie collections
 */

import type {
  MovieEntry,
  MovieSource,
  MovieMetadata,
  AIMetadata,
  MovieSourceType,
} from '../../shared/types/movie'
import { getAdminDatabase, withTransaction } from './adminDb'
import type Database from 'better-sqlite3'

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface SourceRow {
  id: number
  movieId: string
  sourceId: string
  channelId: string
  title: string
  description: string | null
  size: number | null
  addedAt: number
  duration: number | null
  language: string | null
  year: number | null
  downloads: number | null
  viewCount: number | null
  regionRestriction: string | null
}

interface MetadataRow {
  movieId: string
  Title: string | null
  Year: string | null
  Rated: string | null
  Runtime: string | null
  Genre: string | null
  Director: string | null
  Writer: string | null
  Actors: string | null
  Plot: string | null
  Language: string | null
  Country: string | null
  Awards: string | null
  imdbRating: number | null
  imdbVotes: number | null
  imdbID: string | null
  Type: string | null
}

interface MovieRow {
  movieId: string
  title: string
  year: number | null
  verified: number
  lastUpdated: string
}

interface RegionRestriction {
  allowed?: string[]
  blocked?: string[]
}

interface SearchOptions {
  title?: string
  year?: number
  yearFrom?: number
  yearTo?: number
  verified?: boolean
  hasMetadata?: boolean
  genre?: string
  minRating?: number
  sourceType?: MovieSourceType
  limit?: number
  offset?: number
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert a database source row to a MovieSource object
 */
function sourceRowToMovieSource(
  source: SourceRow,
  marks: { mark: string }[],
  type: MovieSourceType,
  channelName: string
): MovieSource {
  let regionRestriction: RegionRestriction | undefined = undefined
  if (source.regionRestriction) {
    try {
      regionRestriction = JSON.parse(source.regionRestriction)
    } catch {
      // Invalid JSON, ignore
    }
  }

  return {
    channelId: source.channelId,
    sourceId: source.sourceId,
    id: source.sourceId, // Alias for backward compatibility
    title: source.title,
    description: source.description || undefined,
    qualityMarks: marks.length > 0 ? marks.map(m => m.mark) : undefined,
    size: source.size || undefined,
    addedAt: source.addedAt,
    duration: source.duration || undefined,
    language: source.language || undefined,
    year: source.year || undefined,
    downloads: source.downloads || undefined,
    viewCount: source.viewCount || undefined,
    regionRestriction: regionRestriction || undefined,
    // Runtime fields
    type,
    channelName,
  }
}

/**
 * Convert metadata row to MovieMetadata object
 */
function metadataRowToMovieMetadata(metadata: MetadataRow): MovieMetadata {
  return {
    Title: metadata.Title ?? undefined,
    Year: metadata.Year ?? undefined,
    Rated: metadata.Rated ?? undefined,
    Runtime: metadata.Runtime ?? undefined,
    Genre: metadata.Genre ?? undefined,
    Director: metadata.Director ?? undefined,
    Writer: metadata.Writer ?? undefined,
    Actors: metadata.Actors ?? undefined,
    Plot: metadata.Plot ?? undefined,
    Language: metadata.Language ?? undefined,
    Country: metadata.Country ?? undefined,
    Awards: metadata.Awards ?? undefined,
    imdbRating: metadata.imdbRating ?? undefined,
    imdbVotes: metadata.imdbVotes ?? undefined,
    imdbID: metadata.imdbID ?? undefined,
    Type: metadata.Type ?? undefined,
  }
}

/**
 * Load sources for a movie with quality marks
 */
function loadSourcesForMovie(db: Database.Database, movieId: string): MovieSource[] {
  const sources = db
    .prepare(
      `
      SELECT s.*, c.platform as type, c.name as channelName
      FROM sources s
      JOIN channels c ON s.channelId = c.id
      WHERE s.movieId = ?
    `
    )
    .all(movieId) as (SourceRow & { type: string; channelName: string })[]

  return sources.map(source => {
    const marks = db
      .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
      .all(source.id) as { mark: string }[]

    return sourceRowToMovieSource(source, marks, source.type as MovieSourceType, source.channelName)
  })
}

/**
 * Load metadata for a movie
 */
function loadMetadataForMovie(db: Database.Database, movieId: string): MovieMetadata | undefined {
  const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(movieId) as
    | MetadataRow
    | undefined

  if (!metadata) return undefined

  return metadataRowToMovieMetadata(metadata)
}

/**
 * Load AI metadata for a movie
 */
function loadAIMetadataForMovie(db: Database.Database, movieId: string): AIMetadata | undefined {
  const aiMetadata = db
    .prepare('SELECT title, year FROM ai_metadata WHERE movieId = ?')
    .get(movieId) as { title: string; year: number } | undefined

  return aiMetadata || undefined
}

/**
 * Load collections for a movie
 */
function loadCollectionsForMovie(
  db: Database.Database,
  movieId: string
): Array<{ id: string; name: string }> | undefined {
  const collections = db
    .prepare(
      `
      SELECT c.id, c.name 
      FROM collections c
      JOIN collection_movies cm ON c.id = cm.collectionId
      WHERE cm.movieId = ?
    `
    )
    .all(movieId) as { id: string; name: string }[]

  return collections.length > 0 ? collections : undefined
}

/**
 * Build a complete MovieEntry from a movie row
 */
function buildMovieEntry(db: Database.Database, movie: MovieRow): MovieEntry {
  const sources = loadSourcesForMovie(db, movie.movieId)
  const metadata = loadMetadataForMovie(db, movie.movieId)
  const ai = loadAIMetadataForMovie(db, movie.movieId)
  const collections = loadCollectionsForMovie(db, movie.movieId)

  return {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year || undefined,
    sources,
    metadata,
    verified: movie.verified === 1,
    ai,
    lastUpdated: movie.lastUpdated,
    collections,
  }
}

// ============================================================================
// MOVIE QUERIES
// ============================================================================

/**
 * Get a single movie by ID with all relations
 * @returns MovieEntry or null if not found
 */
export async function getMovieById(movieId: string): Promise<MovieEntry | null> {
  try {
    const db = getAdminDatabase()

    const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
      | MovieRow
      | undefined

    if (!movie) return null

    return buildMovieEntry(db, movie)
  } catch (error) {
    console.error(`[movieHelpers] Error fetching movie ${movieId}:`, error)
    throw new Error(`Failed to fetch movie: ${error}`)
  }
}

/**
 * Batch fetch multiple movies by IDs
 * @returns Array of MovieEntry objects (in same order as input IDs, with null for missing movies)
 */
export async function getMoviesByIds(movieIds: string[]): Promise<MovieEntry[]> {
  try {
    if (movieIds.length === 0) return []

    const db = getAdminDatabase()

    // Build placeholders for IN clause
    const placeholders = movieIds.map(() => '?').join(',')
    const query = `SELECT * FROM movies WHERE movieId IN (${placeholders})`

    const movies = db.prepare(query).all(...movieIds) as MovieRow[]

    // Build a map for fast lookup
    const movieMap = new Map<string, MovieEntry>()
    for (const movie of movies) {
      movieMap.set(movie.movieId, buildMovieEntry(db, movie))
    }

    // Return in original order, with null for missing movies
    return movieIds.map(id => movieMap.get(id)).filter((m): m is MovieEntry => m !== undefined)
  } catch (error) {
    console.error('[movieHelpers] Error batch fetching movies:', error)
    throw new Error(`Failed to batch fetch movies: ${error}`)
  }
}

/**
 * Search movies with filters and pagination
 * @returns Array of MovieEntry objects matching the search criteria
 */
export async function searchMovies(
  query: string,
  options: SearchOptions = {}
): Promise<MovieEntry[]> {
  try {
    const db = getAdminDatabase()

    const conditions: string[] = []
    const params: (string | number)[] = []

    // Full-text search on title
    if (query.trim()) {
      conditions.push(
        `movieId IN (
          SELECT movieId FROM fts_movies 
          WHERE fts_movies MATCH ?
        )`
      )
      params.push(query.trim())
    }

    // Year filters
    if (options.year !== undefined) {
      conditions.push('year = ?')
      params.push(options.year)
    }
    if (options.yearFrom !== undefined) {
      conditions.push('year >= ?')
      params.push(options.yearFrom)
    }
    if (options.yearTo !== undefined) {
      conditions.push('year <= ?')
      params.push(options.yearTo)
    }

    // Verified filter
    if (options.verified !== undefined) {
      conditions.push('verified = ?')
      params.push(options.verified ? 1 : 0)
    }

    // Has metadata filter
    if (options.hasMetadata !== undefined) {
      if (options.hasMetadata) {
        conditions.push('movieId IN (SELECT movieId FROM metadata)')
      } else {
        conditions.push('movieId NOT IN (SELECT movieId FROM metadata)')
      }
    }

    // Genre filter (requires metadata)
    if (options.genre) {
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE Genre LIKE ?
        )`
      )
      params.push(`%${options.genre}%`)
    }

    // Minimum rating filter (requires metadata)
    if (options.minRating !== undefined) {
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE imdbRating >= ?
        )`
      )
      params.push(options.minRating)
    }

    // Source type filter
    if (options.sourceType) {
      conditions.push(
        `movieId IN (
          SELECT DISTINCT movieId FROM sources 
          WHERE type = ?
        )`
      )
      params.push(options.sourceType)
    }

    // Build final query
    let sql = 'SELECT * FROM movies'
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY lastUpdated DESC'

    // Add pagination
    if (options.limit !== undefined) {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }
    if (options.offset !== undefined) {
      sql += ' OFFSET ?'
      params.push(options.offset)
    }

    const movies = db.prepare(sql).all(...params) as MovieRow[]

    return movies.map(movie => buildMovieEntry(db, movie))
  } catch (error) {
    console.error('[movieHelpers] Error searching movies:', error)
    throw new Error(`Failed to search movies: ${error}`)
  }
}

/**
 * Get total count of movies in the database
 * @returns Number of movies
 */
export async function getMovieCount(): Promise<number> {
  try {
    const db = getAdminDatabase()
    const result = db.prepare('SELECT COUNT(*) as count FROM movies').get() as { count: number }
    return result.count
  } catch (error) {
    console.error('[movieHelpers] Error getting movie count:', error)
    throw new Error(`Failed to get movie count: ${error}`)
  }
}

// ============================================================================
// SOURCE OPERATIONS
// ============================================================================

/**
 * Add a new source to a movie
 * @throws Error if movie doesn't exist or source already exists
 */
export async function addSource(movieId: string, source: MovieSource): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Check if movie exists
      const movie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(movieId)
      if (!movie) {
        throw new Error(`Movie ${movieId} not found`)
      }

      // Check if source already exists
      const existing = db
        .prepare('SELECT id FROM sources WHERE movieId = ? AND channelId = ? AND sourceId = ?')
        .get(movieId, source.channelId, source.id)
      if (existing) {
        throw new Error(`Source ${source.id} already exists for movie ${movieId}`)
      }

      // Convert addedAt to Unix timestamp if it's a string
      const addedAt =
        typeof source.addedAt === 'string'
          ? Math.floor(new Date(source.addedAt).getTime() / 1000)
          : source.addedAt || Math.floor(Date.now() / 1000)

      // Serialize regionRestriction to JSON
      const regionRestrictionJson = source.regionRestriction
        ? JSON.stringify(source.regionRestriction)
        : null

      // Insert source
      const result = db
        .prepare(
          `
        INSERT INTO sources (
          movieId, channelId, sourceId, title, description,
          size, addedAt, duration, language, year,
          downloads, viewCount, regionRestriction
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          movieId,
          source.channelId,
          source.id,
          source.title,
          source.description,
          source.size,
          addedAt,
          source.duration,
          source.language,
          source.year,
          source.downloads,
          source.viewCount,
          regionRestrictionJson
        )

      // Add quality marks if provided
      if (source.qualityMarks && source.qualityMarks.length > 0) {
        const insertMark = db.prepare(`
          INSERT INTO source_quality_marks (sourceId, mark, addedAt)
          VALUES (?, ?, ?)
        `)
        for (const mark of source.qualityMarks) {
          insertMark.run(result.lastInsertRowid, mark, now)
        }
      }

      // Update movie's lastUpdated timestamp
      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, movieId)
    })
  } catch (error) {
    console.error(`[movieHelpers] Error adding source to movie ${movieId}:`, error)
    throw new Error(`Failed to add source: ${error}`)
  }
}

/**
 * Remove a source from a movie by source ID
 * @throws Error if movie or source doesn't exist
 */
export async function removeSource(movieId: string, sourceId: string): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Check if source exists
      const source = db
        .prepare('SELECT id FROM sources WHERE movieId = ? AND sourceId = ?')
        .get(movieId, sourceId) as { id: number } | undefined

      if (!source) {
        throw new Error(`Source ${sourceId} not found for movie ${movieId}`)
      }

      // Delete source (quality marks will be deleted via CASCADE)
      db.prepare('DELETE FROM sources WHERE id = ?').run(source.id)

      // Update movie's lastUpdated timestamp
      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, movieId)
    })
  } catch (error) {
    console.error(`[movieHelpers] Error removing source ${sourceId} from movie ${movieId}:`, error)
    throw new Error(`Failed to remove source: ${error}`)
  }
}

/**
 * Get all sources for a movie
 * @returns Array of MovieSource objects
 */
export async function getSourcesByMovieId(movieId: string): Promise<MovieSource[]> {
  try {
    const db = getAdminDatabase()

    // Check if movie exists
    const movie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(movieId)
    if (!movie) {
      throw new Error(`Movie ${movieId} not found`)
    }

    return loadSourcesForMovie(db, movieId)
  } catch (error) {
    console.error(`[movieHelpers] Error getting sources for movie ${movieId}:`, error)
    throw new Error(`Failed to get sources: ${error}`)
  }
}

/**
 * Update quality marks for a source
 * @throws Error if source doesn't exist
 */
export async function updateSourceQualityMarks(sourceId: string, marks: string[]): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Find source by sourceId (could be archive ID or YouTube ID)
      const source = db
        .prepare('SELECT id, movieId FROM sources WHERE sourceId = ?')
        .get(sourceId) as { id: number; movieId: string } | undefined

      if (!source) {
        throw new Error(`Source ${sourceId} not found`)
      }

      // Delete existing quality marks
      db.prepare('DELETE FROM source_quality_marks WHERE sourceId = ?').run(source.id)

      // Insert new quality marks
      if (marks.length > 0) {
        const insertMark = db.prepare(`
          INSERT INTO source_quality_marks (sourceId, mark, addedAt)
          VALUES (?, ?, ?)
        `)
        for (const mark of marks) {
          insertMark.run(source.id, mark, now)
        }
      }

      // Update movie's lastUpdated timestamp
      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, source.movieId)
    })
  } catch (error) {
    console.error(`[movieHelpers] Error updating quality marks for source ${sourceId}:`, error)
    throw new Error(`Failed to update quality marks: ${error}`)
  }
}

// ============================================================================
// METADATA OPERATIONS
// ============================================================================

/**
 * Update metadata for a movie
 * @throws Error if movie doesn't exist
 */
export async function updateMetadata(movieId: string, metadata: MovieMetadata): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Check if movie exists
      const movie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(movieId)
      if (!movie) {
        throw new Error(`Movie ${movieId} not found`)
      }

      // Insert or replace metadata
      db.prepare(
        `
        INSERT OR REPLACE INTO metadata (
          movieId, Title, Year, Rated, Runtime, Genre, Director, Writer,
          Actors, Plot, Language, Country, Awards, imdbRating,
          imdbVotes, imdbID, Type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        movieId,
        metadata.Title,
        metadata.Year,
        metadata.Rated,
        metadata.Runtime,
        metadata.Genre,
        metadata.Director,
        metadata.Writer,
        metadata.Actors,
        metadata.Plot,
        metadata.Language,
        metadata.Country,
        metadata.Awards,
        metadata.imdbRating,
        metadata.imdbVotes,
        metadata.imdbID,
        metadata.Type
      )

      // Ratings table removed - imdbRating is sufficient

      // Update movie's lastUpdated timestamp
      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, movieId)
    })
  } catch (error) {
    console.error(`[movieHelpers] Error updating metadata for movie ${movieId}:`, error)
    throw new Error(`Failed to update metadata: ${error}`)
  }
}

/**
 * Update AI metadata for a movie
 * @throws Error if movie doesn't exist
 */
export async function updateAIMetadata(movieId: string, aiData: AIMetadata): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Check if movie exists
      const movie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(movieId)
      if (!movie) {
        throw new Error(`Movie ${movieId} not found`)
      }

      // Insert or replace AI metadata
      db.prepare(
        `
        INSERT OR REPLACE INTO ai_metadata (movieId, title, year, extractedAt)
        VALUES (?, ?, ?, ?)
      `
      ).run(movieId, aiData.title, aiData.year, now)

      // Update movie's lastUpdated timestamp
      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, movieId)
    })
  } catch (error) {
    console.error(`[movieHelpers] Error updating AI metadata for movie ${movieId}:`, error)
    throw new Error(`Failed to update AI metadata: ${error}`)
  }
}

/**
 * Check if a movie has metadata
 * @returns true if movie has metadata, false otherwise
 */
export async function hasMetadata(movieId: string): Promise<boolean> {
  try {
    const db = getAdminDatabase()

    const result = db.prepare('SELECT 1 FROM metadata WHERE movieId = ? LIMIT 1').get(movieId) as
      | { 1: number }
      | undefined

    return result !== undefined
  } catch (error) {
    console.error(`[movieHelpers] Error checking metadata for movie ${movieId}:`, error)
    throw new Error(`Failed to check metadata: ${error}`)
  }
}

// ============================================================================
// QUALITY OPERATIONS - REMOVED
// ============================================================================
// Movie-level quality labels have been removed.
// Use source quality marks instead (addSourceQualityMark, removeSourceQualityMark)

// ============================================================================
// COLLECTION OPERATIONS
// ============================================================================

/**
 * Add a movie to a collection
 * @throws Error if movie or collection doesn't exist, or if already in collection
 */
export async function addToCollection(movieId: string, collectionId: string): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Check if movie exists
      const movie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(movieId)
      if (!movie) {
        throw new Error(`Movie ${movieId} not found`)
      }

      // Check if collection exists
      const collection = db.prepare('SELECT id FROM collections WHERE id = ?').get(collectionId)
      if (!collection) {
        throw new Error(`Collection ${collectionId} not found`)
      }

      // Insert into collection_movies (will fail if duplicate due to primary key)
      try {
        db.prepare(
          `
          INSERT INTO collection_movies (collectionId, movieId, addedAt)
          VALUES (?, ?, ?)
        `
        ).run(collectionId, movieId, now)
      } catch (error: unknown) {
        const err = error as { code?: string }
        if (err.code === 'SQLITE_CONSTRAINT') {
          throw new Error(`Movie ${movieId} is already in collection ${collectionId}`)
        }
        throw error
      }

      // Update collection's updatedAt timestamp
      db.prepare('UPDATE collections SET updatedAt = ? WHERE id = ?').run(now, collectionId)
    })
  } catch (error) {
    console.error(
      `[movieHelpers] Error adding movie ${movieId} to collection ${collectionId}:`,
      error
    )
    throw new Error(`Failed to add to collection: ${error}`)
  }
}

/**
 * Remove a movie from a collection
 * @throws Error if movie is not in collection
 */
export async function removeFromCollection(movieId: string, collectionId: string): Promise<void> {
  try {
    await withTransaction(async db => {
      const now = new Date().toISOString()

      // Check if movie is in collection
      const existing = db
        .prepare('SELECT 1 FROM collection_movies WHERE collectionId = ? AND movieId = ?')
        .get(collectionId, movieId)

      if (!existing) {
        throw new Error(`Movie ${movieId} is not in collection ${collectionId}`)
      }

      // Remove from collection
      db.prepare('DELETE FROM collection_movies WHERE collectionId = ? AND movieId = ?').run(
        collectionId,
        movieId
      )

      // Update collection's updatedAt timestamp
      db.prepare('UPDATE collections SET updatedAt = ? WHERE id = ?').run(now, collectionId)
    })
  } catch (error) {
    console.error(
      `[movieHelpers] Error removing movie ${movieId} from collection ${collectionId}:`,
      error
    )
    throw new Error(`Failed to remove from collection: ${error}`)
  }
}

/**
 * Get all collections a movie belongs to
 * @returns Array of collection objects with id and name
 */
export async function getMovieCollections(
  movieId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const db = getAdminDatabase()

    const collections = db
      .prepare(
        `
        SELECT c.id, c.name 
        FROM collections c
        JOIN collection_movies cm ON c.id = cm.collectionId
        WHERE cm.movieId = ?
      `
      )
      .all(movieId) as { id: string; name: string }[]

    return collections
  } catch (error) {
    console.error(`[movieHelpers] Error getting collections for movie ${movieId}:`, error)
    throw new Error(`Failed to get collections: ${error}`)
  }
}
