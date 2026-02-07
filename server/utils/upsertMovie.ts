/**
 * SQLite-based upsertMovie implementation
 *
 * This module provides an atomic upsertMovie() function that writes movie data
 * directly to the SQLite database using transactions.
 */

import type { MovieEntry, MovieSource, MovieSourceType } from '../../shared/types/movie'
import { withTransaction } from './adminDb'
import type Database from 'better-sqlite3'

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
  Ratings?: Array<{ Source: string; Value: string }>
}

interface RegionRestriction {
  allowed?: string[]
  blocked?: string[]
}

/**
 * Normalize language field to handle string | string[] types
 */
function normalizeLanguage(language: string | string[] | undefined): string | undefined {
  if (!language) return undefined
  if (Array.isArray(language)) {
    return language.length > 0 ? language[0] : undefined
  }
  return language
}

/**
 * Helper function to load a complete movie entry from the database
 */
function loadMovieById(db: Database.Database, movieId: string): MovieEntry {
  // Load movie record
  const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
    | { movieId: string; title: string; year: number; verified: number; lastUpdated: string }
    | undefined

  if (!movie) {
    throw new Error(`Movie not found: ${movieId}`)
  }

  // Load sources with channel data
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

  // Load quality marks for each source
  const sourcesWithMarks: MovieSource[] = sources.map(source => {
    const marks = db
      .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
      .all(source.id) as { mark: string }[]

    // Parse JSON regionRestriction field
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
      // Runtime fields from join
      type: source.type as MovieSourceType,
      channelName: source.channelName,
    }
  })

  // Load metadata
  const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(movieId) as
    | MetadataRow
    | undefined

  if (metadata) {
    // No need to load ratings - imdbRating is already in metadata table
  }

  // Load AI metadata
  const aiMetadata = db
    .prepare('SELECT title, year FROM ai_metadata WHERE movieId = ?')
    .get(movieId) as { title: string; year: number } | undefined

  // Load collections
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

  // Convert metadata null values to undefined for type compatibility
  let convertedMetadata: MovieEntry['metadata'] = undefined
  if (metadata) {
    convertedMetadata = {
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

  return {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year || undefined,
    sources: sourcesWithMarks,
    metadata: convertedMetadata,
    verified: movie.verified === 1,
    ai: aiMetadata || undefined,
    lastUpdated: movie.lastUpdated,
    collections: collections.length > 0 ? collections : undefined,
  }
}

/**
 * Upserts a movie entry into the SQLite database using transactions
 * If the movie exists, merges sources and updates metadata
 * Also checks if any source already exists in another entry (e.g., after OMDB enrichment)
 * @returns The existing movie entry if it existed, undefined otherwise
 */
export async function upsertMovie(
  movieId: string,
  entry: MovieEntry
): Promise<MovieEntry | undefined> {
  return await withTransaction(async db => {
    const now = new Date().toISOString()

    // Check if this exact movieId exists
    let existingMovieId = movieId
    let existing = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
      | { movieId: string; title: string; year: number; verified: number; lastUpdated: string }
      | undefined

    // If not found by movieId, check if any of the sources already exist in the database
    // This handles the case where a movie was enriched and got a new IMDb ID
    if (!existing && entry.sources && entry.sources.length > 0) {
      for (const source of entry.sources) {
        const foundMovie = db
          .prepare('SELECT movieId FROM sources WHERE sourceId = ? AND channelId = ?')
          .get(source.id, source.channelId) as { movieId: string } | undefined

        if (foundMovie) {
          existingMovieId = foundMovie.movieId
          existing = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(existingMovieId) as
            | {
                movieId: string
                title: string
                year: number
                verified: number
                lastUpdated: string
              }
            | undefined
          break
        }
      }
    }

    let existingEntry: MovieEntry | undefined

    if (existing) {
      // Load full existing entry for return value
      existingEntry = loadMovieById(db, existingMovieId)

      // Update movie record with enriched data
      db.prepare(
        `
        UPDATE movies 
        SET title = ?, year = ?, verified = ?, lastUpdated = ?
        WHERE movieId = ?
      `
      ).run(
        entry.title || existing.title,
        entry.year ?? existing.year,
        entry.verified ? 1 : 0,
        now,
        existingMovieId
      )

      // Handle sources: INSERT OR IGNORE (due to unique constraint), then UPDATE if exists
      const insertSource = db.prepare(`
        INSERT OR IGNORE INTO sources (
          movieId, channelId, sourceId, title, description,
          size, addedAt, duration, language, year,
          downloads, viewCount, regionRestriction
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const updateSource = db.prepare(`
        UPDATE sources
        SET title = ?, description = COALESCE(?, description), 
            size = COALESCE(?, size),
            duration = COALESCE(?, duration),
            language = COALESCE(?, language), year = COALESCE(?, year), 
            downloads = COALESCE(?, downloads),
            viewCount = COALESCE(?, viewCount), 
            regionRestriction = COALESCE(?, regionRestriction)
        WHERE movieId = ? AND channelId = ? AND sourceId = ?
      `)

      for (const source of entry.sources || []) {
        // Normalize language to string
        const lang = normalizeLanguage(source.language)

        // Check if source exists
        const existingSource = db
          .prepare('SELECT id FROM sources WHERE movieId = ? AND channelId = ? AND sourceId = ?')
          .get(existingMovieId, source.channelId, source.id) as { id: number } | undefined

        // Convert addedAt to Unix timestamp if it's a string
        const addedAt =
          typeof source.addedAt === 'string'
            ? Math.floor(new Date(source.addedAt).getTime() / 1000)
            : source.addedAt || Math.floor(Date.now() / 1000)

        // Serialize regionRestriction to JSON
        const regionRestrictionJson = source.regionRestriction
          ? JSON.stringify(source.regionRestriction)
          : null

        if (existingSource) {
          // Update existing source (preferring non-empty values)
          updateSource.run(
            source.title,
            source.description,
            source.size,
            source.duration,
            lang,
            source.year,
            source.downloads,
            source.viewCount,
            regionRestrictionJson,
            existingMovieId,
            source.channelId,
            source.id
          )

          // Handle quality marks for this source
          if (source.qualityMarks && source.qualityMarks.length > 0) {
            const deleteMarks = db.prepare('DELETE FROM source_quality_marks WHERE sourceId = ?')
            deleteMarks.run(existingSource.id)

            const insertMark = db.prepare(`
              INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt)
              VALUES (?, ?, ?)
            `)
            for (const mark of source.qualityMarks) {
              insertMark.run(existingSource.id, mark, now)
            }
          }
        } else {
          // Insert new source
          const result = insertSource.run(
            existingMovieId,
            source.channelId,
            source.id,
            source.title,
            source.description,
            source.size,
            addedAt,
            source.duration,
            lang,
            source.year,
            source.downloads,
            source.viewCount,
            regionRestrictionJson
          )

          // Handle quality marks for new source
          if (source.qualityMarks && source.qualityMarks.length > 0) {
            const insertMark = db.prepare(`
              INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt)
              VALUES (?, ?, ?)
            `)
            for (const mark of source.qualityMarks) {
              insertMark.run(result.lastInsertRowid, mark, now)
            }
          }
        }
      }

      // Handle metadata: INSERT OR REPLACE
      if (entry.metadata) {
        db.prepare(
          `
          INSERT OR REPLACE INTO metadata (
            movieId, Title, Year, Rated, Runtime, Genre, Director, Writer,
            Actors, Plot, Language, Country, Awards, imdbRating,
            imdbVotes, imdbID, Type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          existingMovieId,
          entry.metadata.Title,
          entry.metadata.Year,
          entry.metadata.Rated,
          entry.metadata.Runtime,
          entry.metadata.Genre,
          entry.metadata.Director,
          entry.metadata.Writer,
          entry.metadata.Actors,
          entry.metadata.Plot,
          entry.metadata.Language,
          entry.metadata.Country,
          entry.metadata.Awards,
          entry.metadata.imdbRating,
          entry.metadata.imdbVotes,
          entry.metadata.imdbID,
          entry.metadata.Type
        )

        // Ratings table removed - imdbRating is sufficient
      }

      // Handle AI metadata: INSERT OR REPLACE
      if (entry.ai) {
        db.prepare(
          `
          INSERT OR REPLACE INTO ai_metadata (movieId, title, year, extractedAt)
          VALUES (?, ?, ?, ?)
        `
        ).run(existingMovieId, entry.ai.title, entry.ai.year, now)
      }

      // Collections are preserved (no changes needed - they're in collection_movies table)

      return existingEntry
    } else {
      // New movie - insert all data
      db.prepare(
        `
        INSERT OR REPLACE INTO movies (movieId, title, year, verified, lastUpdated)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(movieId, entry.title, entry.year, entry.verified ? 1 : 0, now)

      // Insert sources
      const insertSource = db.prepare(`
        INSERT OR IGNORE INTO sources (
          movieId, channelId, sourceId, title, description,
          size, addedAt, duration, language, year,
          downloads, viewCount, regionRestriction
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const source of entry.sources || []) {
        const lang = normalizeLanguage(source.language)

        // Convert addedAt to Unix timestamp if it's a string
        const addedAt =
          typeof source.addedAt === 'string'
            ? Math.floor(new Date(source.addedAt).getTime() / 1000)
            : source.addedAt || Math.floor(Date.now() / 1000)

        // Serialize regionRestriction to JSON
        const regionRestrictionJson = source.regionRestriction
          ? JSON.stringify(source.regionRestriction)
          : null

        const result = insertSource.run(
          movieId,
          source.channelId,
          source.id,
          source.title,
          source.description,
          source.size,
          addedAt,
          source.duration,
          lang,
          source.year,
          source.downloads,
          source.viewCount,
          regionRestrictionJson
        )

        // Handle quality marks
        if (source.qualityMarks && source.qualityMarks.length > 0) {
          const insertMark = db.prepare(`
            INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt)
            VALUES (?, ?, ?)
          `)
          for (const mark of source.qualityMarks) {
            insertMark.run(result.lastInsertRowid, mark, now)
          }
        }
      }

      // Insert metadata if provided
      if (entry.metadata) {
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
          entry.metadata.Title,
          entry.metadata.Year,
          entry.metadata.Rated,
          entry.metadata.Runtime,
          entry.metadata.Genre,
          entry.metadata.Director,
          entry.metadata.Writer,
          entry.metadata.Actors,
          entry.metadata.Plot,
          entry.metadata.Language,
          entry.metadata.Country,
          entry.metadata.Awards,
          entry.metadata.imdbRating,
          entry.metadata.imdbVotes,
          entry.metadata.imdbID,
          entry.metadata.Type
        )

        // Ratings table removed - imdbRating is sufficient
      }

      // Insert AI metadata if provided
      if (entry.ai) {
        db.prepare(
          `
          INSERT OR REPLACE INTO ai_metadata (movieId, title, year, extractedAt)
          VALUES (?, ?, ?, ?)
        `
        ).run(movieId, entry.ai.title, entry.ai.year, now)
      }

      return undefined
    }
  })
}
