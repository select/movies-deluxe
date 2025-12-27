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
        imdbRating REAL,
        imdbVotes INTEGER
      );

      CREATE TABLE channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movieId TEXT NOT NULL,
        type TEXT NOT NULL,
        identifier TEXT NOT NULL,
        channelId TEXT,
        label TEXT,
        quality TEXT,
        addedAt TEXT,
        description TEXT,
        language TEXT,
        FOREIGN KEY (movieId) REFERENCES movies (imdbId) ON DELETE CASCADE,
        FOREIGN KEY (channelId) REFERENCES channels (id)
      );

      CREATE TABLE related_movies (
        movieId TEXT NOT NULL,
        relatedMovieId TEXT NOT NULL,
        score INTEGER NOT NULL,
        FOREIGN KEY (movieId) REFERENCES movies (imdbId) ON DELETE CASCADE,
        FOREIGN KEY (relatedMovieId) REFERENCES movies (imdbId) ON DELETE CASCADE,
        PRIMARY KEY (movieId, relatedMovieId)
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
      CREATE INDEX idx_sources_channelId ON sources(channelId);
      CREATE INDEX idx_related_movies_movieId ON related_movies(movieId);
      CREATE INDEX idx_related_movies_score ON related_movies(movieId, score DESC);
    `)

    // 5. Prepare Statements
    const insertMovie = sqlite.prepare(`
      INSERT INTO movies (
        imdbId, title, year, verified, is_curated, lastUpdated, rated, runtime, genre,
        director, writer, actors, plot, language, country, awards,
        imdbRating, imdbVotes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertChannel = sqlite.prepare(`
      INSERT OR IGNORE INTO channels (id, name, created_at)
      VALUES (?, ?, ?)
    `)

    const insertSource = sqlite.prepare(`
      INSERT INTO sources (
        movieId, type, identifier, channelId, label, quality, addedAt, description, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertFts = sqlite.prepare(`
      INSERT INTO fts_movies (imdbId, title, actors, director, plot)
      VALUES (?, ?, ?, ?, ?)
    `)

    const insertRelated = sqlite.prepare(`
      INSERT INTO related_movies (movieId, relatedMovieId, score)
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

            // Get identifier - handle both 'id' and 'videoId' fields for YouTube sources
            const identifier = (source as any).id || (source as any).videoId || null

            // Insert channel if YouTube source
            let channelId = null
            if (source.type === 'youtube') {
              const ytChannelId = (source as any).channelId
              const ytChannelName = (source as any).channelName
              if (ytChannelId && ytChannelName) {
                insertChannel.run(ytChannelId, ytChannelName, new Date().toISOString())
                channelId = ytChannelId
              }
            }

            insertSource.run(
              movie.imdbId,
              source.type,
              identifier,
              channelId,
              source.label || null,
              source.quality || null,
              source.addedAt,
              description,
              sourceLanguage
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

      // 7. Calculate Related Movies
      logger.info('Calculating related movies...')
      onProgress?.({ current: 0, total: movies.length, message: 'Calculating related movies' })

      // Pre-process metadata for faster scoring
      const processedMovies = movies.map(m => ({
        imdbId: m.imdbId,
        year: m.year,
        hasMetadata: !!m.metadata,
        genres: m.metadata?.Genre
          ? m.metadata.Genre.split(',')
              .map(g => g.trim().toLowerCase())
              .filter(Boolean)
          : [],
        actors: m.metadata?.Actors
          ? m.metadata.Actors.split(',')
              .map(a => a.trim().toLowerCase())
              .filter(Boolean)
          : [],
        director: m.metadata?.Director ? m.metadata.Director.toLowerCase() : null,
      }))

      // Create maps for fast lookup
      const genreMap = new Map<string, string[]>()
      const actorMap = new Map<string, string[]>()
      const directorMap = new Map<string, string[]>()

      for (const m of processedMovies) {
        for (const g of m.genres) {
          if (!genreMap.has(g)) genreMap.set(g, [])
          genreMap.get(g)!.push(m.imdbId)
        }
        for (const a of m.actors) {
          if (!actorMap.has(a)) actorMap.set(a, [])
          actorMap.get(a)!.push(m.imdbId)
        }
        if (m.director) {
          if (!directorMap.has(m.director)) directorMap.set(m.director, [])
          directorMap.get(m.director)!.push(m.imdbId)
        }
      }

      const movieMap = new Map(processedMovies.map(m => [m.imdbId, m]))

      for (let i = 0; i < processedMovies.length; i++) {
        const m1 = processedMovies[i]!
        const candidateScores = new Map<string, number>()

        // 1. Genre match (10 pts each)
        for (const g of m1.genres) {
          for (const id of genreMap.get(g) || []) {
            if (id === m1.imdbId) continue
            candidateScores.set(id, (candidateScores.get(id) || 0) + 10)
          }
        }

        // 2. Director match (15 pts)
        if (m1.director) {
          for (const id of directorMap.get(m1.director) || []) {
            if (id === m1.imdbId) continue
            candidateScores.set(id, (candidateScores.get(id) || 0) + 15)
          }
        }

        // 3. Actor match (5 pts each)
        for (const a of m1.actors) {
          for (const id of actorMap.get(a) || []) {
            if (id === m1.imdbId) continue
            candidateScores.set(id, (candidateScores.get(id) || 0) + 5)
          }
        }

        // 4. Refine scores with year and metadata
        const finalScores: { id: string; score: number }[] = []
        for (const [id2, baseScore] of candidateScores.entries()) {
          const m2 = movieMap.get(id2)!
          let score = baseScore

          // Year proximity (±5 years, 2-10 pts)
          if (m1.year && m2.year) {
            const yearDiff = Math.abs(m1.year - m2.year)
            if (yearDiff <= 5) {
              score += (5 - yearDiff) * 2
            }
          }

          // Metadata presence (1 pt)
          if (m2.hasMetadata) {
            score += 1
          }

          finalScores.push({ id: id2, score })
        }

        // Sort and take top 12
        finalScores.sort((a, b) => b.score - a.score)
        const topRelated = finalScores.slice(0, 12)

        for (const related of topRelated) {
          insertRelated.run(m1.imdbId, related.id, related.score)
        }

        if ((i + 1) % 1000 === 0) {
          onProgress?.({
            current: i + 1,
            total: movies.length,
            message: `Calculated related movies for ${i + 1} movies`,
          })
        }
      }

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

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]!)) {
  generateSQLite().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { generateSQLite }
