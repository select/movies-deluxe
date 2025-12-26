/**
 * SQLite Database Generation Script
 *
 * Converts public/data/movies.json to public/data/movies.db
 * Optimized for client-side SQLite Wasm usage.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { loadMoviesDatabase } from '../server/utils/movieData'
import { createLogger } from '../server/utils/logger'
import { normalizeLanguageCode } from '../shared/utils/languageNormalizer'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('SQLiteGen')
const DB_PATH = join(process.cwd(), 'public/data/movies.db')

async function generateSQLite(
  onProgress?: (progress: { current: number; total: number; message: string }) => void
) {
  logger.info('Starting SQLite database generation...')

  // 1. Load JSON data
  const db = await loadMoviesDatabase()
  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  logger.info(`Processing ${movies.length} movies`)
  onProgress?.({ current: 0, total: movies.length, message: 'Loading movies from JSON' })

  // 2. Remove existing DB if it exists
  if (existsSync(DB_PATH)) {
    logger.info('Removing existing database file')
    unlinkSync(DB_PATH)
  }

  // 3. Initialize Database
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
        verified INTEGER DEFAULT 0,
        is_curated INTEGER DEFAULT 0,
        lastUpdated TEXT,
        rated TEXT,
        runtime TEXT,
        genre TEXT,
        director TEXT,
        writer TEXT,
        actors TEXT,
        plot TEXT,
        language TEXT,
        country TEXT,
        awards TEXT,
        poster TEXT,
        imdbRating REAL,
        imdbVotes INTEGER
      );

      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movieId TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        label TEXT,
        quality TEXT,
        addedAt TEXT,
        description TEXT,
        identifier TEXT,
        language TEXT,
        youtube_channelName TEXT,
        youtube_channelId TEXT,
        FOREIGN KEY (movieId) REFERENCES movies (imdbId) ON DELETE CASCADE
      );

      -- FTS5 Virtual Table for Search
      CREATE VIRTUAL TABLE fts_movies USING fts5(
        imdbId UNINDEXED,
        title,
        actors,
        director,
        plot,
        tokenize='unicode61'
      );

      -- Indexes for efficient filtering and sorting
      CREATE INDEX idx_movies_year ON movies(year);
      CREATE INDEX idx_movies_rating ON movies(imdbRating);
      CREATE INDEX idx_movies_votes ON movies(imdbVotes);
      CREATE INDEX idx_movies_verified ON movies(verified);
      CREATE INDEX idx_movies_curated ON movies(is_curated);
      CREATE INDEX idx_movies_title ON movies(title);
      
      CREATE INDEX idx_sources_movieId ON sources(movieId);
      CREATE INDEX idx_sources_type ON sources(type);
      CREATE INDEX idx_sources_channel ON sources(youtube_channelName);
    `)

    // 5. Prepare Statements
    const insertMovie = sqlite.prepare(`
      INSERT INTO movies (
        imdbId, title, year, verified, is_curated, lastUpdated, rated, runtime, genre,
        director, writer, actors, plot, language, country, awards, poster,
        imdbRating, imdbVotes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertSource = sqlite.prepare(`
      INSERT INTO sources (
        movieId, type, url, label, quality, addedAt, description,
        identifier, language, youtube_channelName, youtube_channelId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertFts = sqlite.prepare(`
      INSERT INTO fts_movies (imdbId, title, actors, director, plot)
      VALUES (?, ?, ?, ?, ?)
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
        const imdbVotes =
          m.imdbVotes && m.imdbVotes !== 'N/A' ? parseInt(m.imdbVotes.replace(/,/g, ''), 10) : null

        // Determine language priority: Archive.org language > YouTube language > OMDB language
        let language: string | null = null
        for (const source of movie.sources) {
          if (source.type === 'archive.org' && (source as any).language) {
            language = normalizeLanguageCode((source as any).language)
            break // Archive.org language has highest priority
          } else if (source.type === 'youtube' && (source as any).language) {
            language = normalizeLanguageCode((source as any).language)
            // Don't break - keep looking for Archive.org language
          }
        }
        // Fallback to OMDB metadata language if no source language found
        if (!language && m.Language) {
          language = normalizeLanguageCode(m.Language)
        }

        insertMovie.run(
          movie.imdbId,
          Array.isArray(movie.title) ? movie.title[0] : movie.title,
          movie.year || null,
          movie.verified ? 1 : 0,
          movie.metadata ? 1 : 0,
          movie.lastUpdated,
          m.Rated || null,
          m.Runtime || null,
          m.Genre || null,
          m.Director || null,
          m.Writer || null,
          m.Actors || null,
          m.Plot || null,
          language,
          m.Country || null,
          m.Awards || null,
          m.Poster || null,
          imdbRating,
          imdbVotes
        )

        // Insert sources
        for (const source of movie.sources) {
          try {
            // Handle description - can be string or array
            const description = source.description
              ? Array.isArray(source.description)
                ? source.description.join(' | ')
                : source.description
              : null

            // Normalize source language
            const sourceLanguage = normalizeLanguageCode((source as any).language)

            insertSource.run(
              movie.imdbId,
              source.type,
              source.url,
              source.label || null,
              source.quality || null,
              source.addedAt,
              description,
              (source as any).id || null,
              sourceLanguage,
              source.type === 'youtube' ? (source as any).channelName : null,
              source.type === 'youtube' ? (source as any).channelId : null
            )
          } catch (err) {
            logger.error(`Failed to insert source for movie ${movie.imdbId}:`, err)
            logger.error('Source data:', JSON.stringify(source, null, 2))
            throw err
          }
        }

        // Insert into FTS
        const ftsTitle = Array.isArray(movie.title) ? movie.title.join(' ') : movie.title
        insertFts.run(movie.imdbId, ftsTitle, m.Actors || '', m.Director || '', m.Plot || '')

        count++
        if (count % 1000 === 0) {
          onProgress?.({
            current: count,
            total: movies.length,
            message: `Inserting movie ${count}`,
          })
        }
      }
      sqlite.exec('COMMIT')
    } catch (err) {
      sqlite.exec('ROLLBACK')
      throw err
    }

    // 7. Optimize
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

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]!)) {
  generateSQLite().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { generateSQLite }
