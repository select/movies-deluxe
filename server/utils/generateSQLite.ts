/**
 * SQLite Database Generation Utility
 *
 * Converts data/movies.json to public/data/movies.db
 * Optimized for client-side SQLite Wasm usage.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { loadMoviesDatabase } from './movieData'
import { loadCollectionsDatabase } from './collections'
import { createLogger } from './logger'
import { normalizeLanguageCode } from '../../shared/utils/languageNormalizer'
import { generateMovieJSON } from './generateMovieJSON'
import type { MovieEntry, ArchiveOrgSource, YouTubeSource } from '../../shared/types/movie'
import type { Collection } from '../../shared/types/collections'

const logger = createLogger('SQLiteGen')
const DB_PATH = join(process.cwd(), 'public/data/movies.db')

export async function generateSQLite(
  onProgress?: (progress: { current: number; total: number; message: string }) => void
) {
  logger.info('Starting SQLite database generation...')

  // 1. Generate individual movie JSON files first
  logger.info('Generating individual movie JSON files...')
  await generateMovieJSON()

  // 2. Load JSON data
  const db = await loadMoviesDatabase()
  const collectionsDb = await loadCollectionsDatabase()
  const allMovies = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  // Use all movies for the database
  const movies = allMovies

  // Create a Set of valid movie IDs for quick lookup
  const validMovieIds = new Set(movies.map(m => m.imdbId))

  logger.info(`Loaded ${allMovies.length} total movies`)
  logger.info(`Processing ${movies.length} movies for database`)

  const collections = Object.values(collectionsDb).filter(
    (entry): entry is Collection => typeof entry === 'object' && entry !== null && 'id' in entry
  )

  onProgress?.({ current: 0, total: movies.length, message: 'Loading movies from JSON' })

  // 3. Remove existing DB if it exists
  if (existsSync(DB_PATH)) {
    logger.info('Removing existing database file')
    unlinkSync(DB_PATH)
  }

  // 4. Initialize Database
  const sqlite = new Database(DB_PATH)

  // Use DELETE mode instead of WAL for better compatibility with WASM
  sqlite.pragma('journal_mode = DELETE')

  try {
    // 4. Create Schema
    logger.info('Creating schema...')
    onProgress?.({ current: 0, total: movies.length, message: 'Creating database schema' })
    sqlite.exec(`
      CREATE TABLE movies (
        imdbId TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER,
        imdbRating REAL,
        imdbVotes INTEGER,
        language TEXT,
        genre TEXT,
        country TEXT,
        primarySourceType TEXT,
        primaryChannelName TEXT,
        verified INTEGER DEFAULT 0,
        lastUpdated TEXT
      );

      CREATE TABLE genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        movie_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE countries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        movie_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE collection_movies (
        collectionId TEXT NOT NULL,
        movieId TEXT NOT NULL,
        addedAt TEXT NOT NULL,
        PRIMARY KEY (collectionId, movieId),
        FOREIGN KEY (collectionId) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (movieId) REFERENCES movies (imdbId) ON DELETE CASCADE
      );

      -- FTS5 Virtual Table for Search (title only)
      CREATE VIRTUAL TABLE fts_movies USING fts5(
        imdbId UNINDEXED,
        title,
        tokenize='unicode61'
      );

      -- Indexes for efficient filtering and sorting
      CREATE INDEX idx_movies_year ON movies(year);
      CREATE INDEX idx_movies_rating ON movies(imdbRating);
      CREATE INDEX idx_movies_votes ON movies(imdbVotes);
      CREATE INDEX idx_movies_title ON movies(title);
      CREATE INDEX idx_movies_source_type ON movies(primarySourceType);
      CREATE INDEX idx_movies_channel ON movies(primaryChannelName);
      
      CREATE INDEX idx_genres_name ON genres(name);
      CREATE INDEX idx_genres_count ON genres(movie_count DESC);
      CREATE INDEX idx_countries_name ON countries(name);
      CREATE INDEX idx_countries_count ON countries(movie_count DESC);
      CREATE INDEX idx_collection_movies_collectionId ON collection_movies(collectionId);
      CREATE INDEX idx_collection_movies_movieId ON collection_movies(movieId);
    `)

    // 5. Prepare Statements
    const insertMovie = sqlite.prepare(`
      INSERT INTO movies (
        imdbId, title, year, imdbRating, imdbVotes, language, genre, country,
        primarySourceType, primaryChannelName, verified, lastUpdated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertGenre = sqlite.prepare(`
      INSERT OR IGNORE INTO genres (name, movie_count, created_at)
      VALUES (?, ?, ?)
    `)

    const insertCountry = sqlite.prepare(`
      INSERT OR IGNORE INTO countries (name, movie_count, created_at)
      VALUES (?, ?, ?)
    `)

    const insertFts = sqlite.prepare(`
      INSERT INTO fts_movies (imdbId, title)
      VALUES (?, ?)
    `)

    const insertCollection = sqlite.prepare(`
      INSERT INTO collections (id, name, description, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `)

    const insertCollectionMovie = sqlite.prepare(`
      INSERT INTO collection_movies (collectionId, movieId, addedAt)
      VALUES (?, ?, ?)
    `)

    // 6. Insert Data in a Transaction
    logger.info('Inserting data...')
    sqlite.exec('BEGIN TRANSACTION')
    try {
      let count = 0
      for (const movie of movies) {
        // Map metadata fields
        const m = movie.metadata || {}
        const imdbRating = m.imdbRating && m.imdbRating !== 'N/A' ? parseFloat(m.imdbRating) : null
        const imdbVotes = m.imdbVotes ?? null

        // Determine language priority: Archive.org language > YouTube language > OMDB language
        let language: string | null = null
        for (const source of movie.sources) {
          if (source.type === 'archive.org' && (source as ArchiveOrgSource).language) {
            language = normalizeLanguageCode((source as ArchiveOrgSource).language!)
            break // Archive.org language has highest priority
          } else if (source.type === 'youtube' && (source as YouTubeSource).language) {
            language = normalizeLanguageCode((source as YouTubeSource).language!)
            // Don't break - keep looking for Archive.org language
          }
        }
        // Fallback to OMDB metadata language if no source language found
        if (!language && m.Language) {
          language = normalizeLanguageCode(m.Language)
        }

        // Determine primary source info for lightweight grid display
        const primarySource = movie.sources[0]
        const primarySourceType = primarySource?.type || null
        let primaryChannelName = null
        if (primarySource?.type === 'youtube') {
          primaryChannelName = (primarySource as YouTubeSource).channelName || null
        }

        insertMovie.run(
          movie.imdbId,
          Array.isArray(movie.title) ? movie.title[0] : movie.title,
          movie.year || null,
          imdbRating,
          imdbVotes,
          language,
          m.Genre || null,
          m.Country || null,
          primarySourceType,
          primaryChannelName,
          movie.verified ? 1 : 0,
          movie.lastUpdated
        )

        // Sources are now stored in individual JSON files, not in the database

        // Insert into FTS
        const ftsTitle = Array.isArray(movie.title) ? movie.title.join(' ') : movie.title
        insertFts.run(movie.imdbId, ftsTitle)

        count++
        if (count % 1000 === 0) {
          onProgress?.({
            current: count,
            total: movies.length,
            message: `Inserting movie ${count}`,
          })
        }
      }

      // 6.5. Populate Genres and Countries
      logger.info('Populating genres and countries...')
      onProgress?.({
        current: movies.length,
        total: movies.length,
        message: 'Populating genres and countries',
      })

      const genreCounts = new Map<string, number>()
      const countryCounts = new Map<string, number>()

      for (const movie of movies) {
        if (movie.metadata?.Genre) {
          const genres = movie.metadata.Genre.split(',').map(g => g.trim())
          genres.forEach(genre => {
            if (genre && genre !== 'N/A') {
              genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
            }
          })
        }

        if (movie.metadata?.Country) {
          const countries = movie.metadata.Country.split(',').map(c => c.trim())
          countries.forEach(country => {
            if (country && country !== 'N/A') {
              // Normalize country names
              let normalizedCountry = country
              if (country === 'USA') normalizedCountry = 'United States'
              if (country === 'UK') normalizedCountry = 'United Kingdom'

              countryCounts.set(normalizedCountry, (countryCounts.get(normalizedCountry) || 0) + 1)
            }
          })
        }
      }

      const now = new Date().toISOString()
      for (const [name, count] of genreCounts) {
        insertGenre.run(name, count, now)
      }

      for (const [name, count] of countryCounts) {
        insertCountry.run(name, count, now)
      }

      logger.info(`Inserted ${genreCounts.size} genres and ${countryCounts.size} countries`)

      // 6.7. Populate Collections
      logger.info('Populating collections...')
      for (const collection of collections) {
        insertCollection.run(
          collection.id,
          collection.name,
          collection.description || null,
          collection.createdAt,
          collection.updatedAt
        )

        for (const movieId of collection.movieIds) {
          // Only insert if movie exists in our filtered database (not quality-labeled)
          if (validMovieIds.has(movieId)) {
            insertCollectionMovie.run(collection.id, movieId, collection.updatedAt)
          }
        }
      }
      logger.info(`Inserted ${collections.length} collections`)

      sqlite.exec('COMMIT')
    } catch (err) {
      sqlite.exec('ROLLBACK')
      throw err
    }

    // 8. Optimize
    logger.info('Optimizing database...')
    onProgress?.({ current: movies.length, total: movies.length, message: 'Optimizing database' })
    sqlite.exec("INSERT INTO fts_movies(fts_movies) VALUES('optimize')")
    sqlite.exec('VACUUM')
    sqlite.exec('ANALYZE')

    logger.success('SQLite database generated successfully!')

    const stats = sqlite.prepare('SELECT count(*) as count FROM movies').get() as { count: number }
    logger.info(`Final database contains ${stats.count} movies`)
    onProgress?.({
      current: movies.length,
      total: movies.length,
      message: `Completed: ${stats.count} movies generated`,
    })
  } catch (error) {
    logger.error('Failed to generate SQLite database:', error)
    throw error
  } finally {
    sqlite.close()
  }
}
