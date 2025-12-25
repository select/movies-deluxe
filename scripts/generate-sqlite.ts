/**
 * SQLite Database Generation Script
 *
 * Converts public/data/movies.json to public/data/movies.db
 * Optimized for client-side SQLite Wasm usage.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { loadMoviesDatabase } from './utils/dataManager'
import { createLogger } from './utils/logger'
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

  // Enable WAL mode for better performance
  sqlite.pragma('journal_mode = WAL')

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
        archive_identifier TEXT,
        youtube_videoId TEXT,
        youtube_channelName TEXT,
        youtube_channelId TEXT,
        youtube_language TEXT,
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
    `)

    // 5. Prepare Statements
    const insertMovie = sqlite.prepare(`
      INSERT INTO movies (
        imdbId, title, year, verified, lastUpdated, rated, runtime, genre,
        director, writer, actors, plot, language, country, awards, poster,
        imdbRating, imdbVotes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertSource = sqlite.prepare(`
      INSERT INTO sources (
        movieId, type, url, label, quality, addedAt, description,
        archive_identifier, youtube_videoId, youtube_channelName,
        youtube_channelId, youtube_language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertFts = sqlite.prepare(`
      INSERT INTO fts_movies (imdbId, title, actors, director, plot)
      VALUES (?, ?, ?, ?, ?)
    `)

    // 6. Insert Data in a Transaction
    logger.info('Inserting data...')
    const transaction = sqlite.transaction((movieEntries: MovieEntry[]) => {
      let count = 0
      for (const movie of movieEntries) {
        // Map metadata fields
        const m = movie.metadata || {}
        const imdbRating = m.imdbRating && m.imdbRating !== 'N/A' ? parseFloat(m.imdbRating) : null
        const imdbVotes =
          m.imdbVotes && m.imdbVotes !== 'N/A' ? parseInt(m.imdbVotes.replace(/,/g, ''), 10) : null

        insertMovie.run(
          movie.imdbId,
          movie.title,
          movie.year || null,
          movie.verified ? 1 : 0,
          movie.lastUpdated,
          m.Rated || null,
          m.Runtime || null,
          m.Genre || null,
          m.Director || null,
          m.Writer || null,
          m.Actors || null,
          m.Plot || null,
          m.Language || null,
          m.Country || null,
          m.Awards || null,
          m.Poster || null,
          imdbRating,
          imdbVotes
        )

        // Insert sources
        for (const source of movie.sources) {
          insertSource.run(
            movie.imdbId,
            source.type,
            source.url,
            source.label || null,
            source.quality || null,
            source.addedAt,
            source.description || null,
            source.type === 'archive.org' ? source.id : null,
            source.type === 'youtube' ? source.id : null,
            source.type === 'youtube' ? source.channelName : null,
            source.type === 'youtube' ? source.channelId : null,
            source.type === 'youtube' ? source.language : null
          )
        }

        // Insert into FTS
        insertFts.run(movie.imdbId, movie.title, m.Actors || '', m.Director || '', m.Plot || '')

        count++
        if (count % 100 === 0) {
          onProgress?.({
            current: count,
            total: movieEntries.length,
            message: `Inserting movie ${count}`,
          })
        }
      }
    })

    transaction(movies)

    // 7. Optimize
    logger.info('Optimizing database...')
    onProgress?.({ current: movies.length, total: movies.length, message: 'Optimizing database' })
    sqlite.exec('INSERT INTO fts_movies(fts_movies) VALUES("optimize")')
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
