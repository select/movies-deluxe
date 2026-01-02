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
import { loadCollectionsDatabase } from '../server/utils/collections'
import { createLogger } from '../server/utils/logger'
import { normalizeLanguageCode } from '../shared/utils/languageNormalizer'
import type { MovieEntry, ArchiveOrgSource, YouTubeSource } from '../shared/types/movie'
import type { Collection } from '../shared/types/collections'

const logger = createLogger('SQLiteGen')
const DB_PATH = join(process.cwd(), 'public/data/movies.db')

async function generateSQLite(
  onProgress?: (progress: { current: number; total: number; message: string }) => void
) {
  logger.info('Starting SQLite database generation...')

  // 1. Load JSON data
  const db = await loadMoviesDatabase()
  const collectionsDb = await loadCollectionsDatabase()
  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const collections = Object.values(collectionsDb).filter(
    (entry): entry is Collection => typeof entry === 'object' && entry !== null && 'id' in entry
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
        imdbRating REAL,
        imdbVotes INTEGER,
        language TEXT,
        genre TEXT,
        country TEXT,
        primarySourceType TEXT,
        primaryChannelName TEXT,
        is_curated INTEGER DEFAULT 0,
        verified INTEGER DEFAULT 0,
        qualityLabels TEXT,
        lastUpdated TEXT
      );

      CREATE TABLE channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
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

      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movieId TEXT NOT NULL,
        type TEXT NOT NULL,
        identifier TEXT NOT NULL,
        title TEXT,
        channelId TEXT,
        addedAt TEXT,
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
        FOREIGN KEY (movieId) REFERENCES movies(imdbId) ON DELETE CASCADE
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
      CREATE INDEX idx_movies_verified ON movies(verified);
      CREATE INDEX idx_movies_curated ON movies(is_curated);
      CREATE INDEX idx_movies_title ON movies(title);
      
      CREATE INDEX idx_sources_movieId ON sources(movieId);
      CREATE INDEX idx_sources_type ON sources(type);
      CREATE INDEX idx_sources_channelId ON sources(channelId);
      CREATE INDEX idx_genres_name ON genres(name);
      CREATE INDEX idx_genres_count ON genres(movie_count DESC);
      CREATE INDEX idx_countries_name ON countries(name);
      CREATE INDEX idx_countries_count ON countries(movie_count DESC);
      CREATE INDEX idx_related_movies_movieId ON related_movies(movieId);
      CREATE INDEX idx_related_movies_score ON related_movies(movieId, score DESC);
      CREATE INDEX idx_collection_movies_collectionId ON collection_movies(collectionId);
      CREATE INDEX idx_collection_movies_movieId ON collection_movies(movieId);
    `)

    // 5. Prepare Statements
    const insertMovie = sqlite.prepare(`
      INSERT INTO movies (
        imdbId, title, year, imdbRating, imdbVotes, language, genre, country,
        primarySourceType, primaryChannelName, is_curated, verified,
        qualityLabels, lastUpdated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertChannel = sqlite.prepare(`
      INSERT OR IGNORE INTO channels (id, name, created_at)
      VALUES (?, ?, ?)
    `)

    const insertGenre = sqlite.prepare(`
      INSERT OR IGNORE INTO genres (name, movie_count, created_at)
      VALUES (?, ?, ?)
    `)

    const insertCountry = sqlite.prepare(`
      INSERT OR IGNORE INTO countries (name, movie_count, created_at)
      VALUES (?, ?, ?)
    `)

    const insertSource = sqlite.prepare(`
      INSERT INTO sources (
        movieId, type, identifier, title, channelId, addedAt, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const insertFts = sqlite.prepare(`
      INSERT INTO fts_movies (imdbId, title)
      VALUES (?, ?)
    `)

    const insertRelated = sqlite.prepare(`
      INSERT INTO related_movies (movieId, relatedMovieId, score)
      VALUES (?, ?, ?)
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
        const imdbVotes =
          m.imdbVotes && m.imdbVotes !== 'N/A' ? parseInt(m.imdbVotes.replace(/,/g, ''), 10) : null

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
          movie.metadata ? 1 : 0,
          movie.verified ? 1 : 0,
          movie.qualityLabels ? movie.qualityLabels.join(',') : null,
          movie.lastUpdated
        )

        // Insert sources
        for (const source of movie.sources) {
          try {
            // Normalize source language
            const sourceLanguage =
              source.type === 'archive.org'
                ? normalizeLanguageCode((source as ArchiveOrgSource).language)
                : normalizeLanguageCode((source as YouTubeSource).language)

            // Get identifier - handle both 'id' and 'videoId' fields for YouTube sources
            const identifier =
              source.type === 'youtube'
                ? (source as YouTubeSource).id
                : (source as ArchiveOrgSource).id

            // Insert channel if YouTube source
            let channelId = null
            if (source.type === 'youtube') {
              const ytSource = source as YouTubeSource
              const ytChannelId = ytSource.channelId
              const ytChannelName = ytSource.channelName
              if (ytChannelId && ytChannelName) {
                insertChannel.run(ytChannelId, ytChannelName, new Date().toISOString())
                channelId = ytChannelId
              }
            }

            insertSource.run(
              movie.imdbId,
              source.type,
              identifier,
              source.title || null,
              channelId,
              source.addedAt,
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
          // Only insert if movie exists in our database
          if (db[movieId]) {
            insertCollectionMovie.run(collection.id, movieId, collection.updatedAt)
          }
        }
      }
      logger.info(`Inserted ${collections.length} collections`)

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
