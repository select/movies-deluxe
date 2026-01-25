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
import { getDefaultModel } from '../../config/embedding-models'
import type { EmbeddingModelConfig } from '../../config/embedding-models'
import type { MovieEntry } from '../../shared/types/movie'
import type { Collection } from '../../shared/types/collections'

const logger = createLogger('SQLiteGen')
const DB_PATH = join(process.cwd(), 'public/data/movies.db')

export interface GenerateSQLiteOptions {
  embeddingModel?: EmbeddingModelConfig
  skipJsonGeneration?: boolean
  onProgress?: (progress: { current: number; total: number; message: string }) => void
}

export async function generateSQLite(options: GenerateSQLiteOptions = {}) {
  const { embeddingModel = getDefaultModel(), skipJsonGeneration = false, onProgress } = options

  logger.info(`Starting SQLite database generation with model: ${embeddingModel.name}...`)

  // 1. Generate individual movie JSON files first
  if (!skipJsonGeneration) {
    logger.info('Generating individual movie JSON files...')
    await generateMovieJSON()
  } else {
    logger.info('Skipping individual movie JSON generation')
  }

  // 2. Load JSON data
  const db = await loadMoviesDatabase()
  const collectionsDb = await loadCollectionsDatabase()

  // Note: Embeddings are stored externally in separate DB files (e.g., embeddings-nomic.db)
  // They are NOT loaded into the main movies.db to keep its size small (~10MB vs 70MB)
  // The embedding model metadata is still stored in config for reference

  const allMovies = Object.values(db)
    .filter(
      (entry): entry is MovieEntry =>
        typeof entry === 'object' && entry !== null && 'movieId' in entry
    )
    .map(movie => ({
      ...movie,
      sources: movie.sources.filter(s => !s.qualityMarks || s.qualityMarks.length === 0),
    }))
    .filter(movie => movie.sources.length > 0)

  // Use all movies for the database
  const movies = allMovies

  // Create a Set of valid movie IDs for quick lookup
  const validMovieIds = new Set(movies.map(m => m.movieId))

  logger.info(`Loaded ${allMovies.length} total movies`)
  logger.info(`Processing ${movies.length} movies for database`)

  const collections = Object.values(collectionsDb).filter(
    (entry): entry is Collection => typeof entry === 'object' && entry !== null && 'id' in entry
  )

  onProgress?.({ current: 0, total: movies.length, message: 'Loading data' })

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
    onProgress?.({ current: 0, total: movies.length, message: 'Creating schema' })
    sqlite.exec(`
      CREATE TABLE movies (
        movieId TEXT PRIMARY KEY,
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
        FOREIGN KEY (movieId) REFERENCES movies (movieId) ON DELETE CASCADE
      );

      -- People tables
      CREATE TABLE actors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        movie_count INTEGER DEFAULT 0
      );

      CREATE TABLE directors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        movie_count INTEGER DEFAULT 0
      );

      CREATE TABLE writers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        movie_count INTEGER DEFAULT 0
      );

      -- Junction tables
      CREATE TABLE movie_actors (
        movieId TEXT NOT NULL,
        actorId INTEGER NOT NULL,
        character TEXT,
        PRIMARY KEY (movieId, actorId),
        FOREIGN KEY (movieId) REFERENCES movies (movieId) ON DELETE CASCADE,
        FOREIGN KEY (actorId) REFERENCES actors (id) ON DELETE CASCADE
      );

      CREATE TABLE movie_directors (
        movieId TEXT NOT NULL,
        directorId INTEGER NOT NULL,
        PRIMARY KEY (movieId, directorId),
        FOREIGN KEY (movieId) REFERENCES movies (movieId) ON DELETE CASCADE,
        FOREIGN KEY (directorId) REFERENCES directors (id) ON DELETE CASCADE
      );

      CREATE TABLE movie_writers (
        movieId TEXT NOT NULL,
        writerId INTEGER NOT NULL,
        PRIMARY KEY (movieId, writerId),
        FOREIGN KEY (movieId) REFERENCES movies (movieId) ON DELETE CASCADE,
        FOREIGN KEY (writerId) REFERENCES writers (id) ON DELETE CASCADE
      );

      -- FTS5 Virtual Table for Search (title only)
      CREATE VIRTUAL TABLE fts_movies USING fts5(
        movieId UNINDEXED,
        title,
        tokenize='unicode61'
      );

      -- FTS5 Virtual Tables for People
      CREATE VIRTUAL TABLE fts_actors USING fts5(
        actorId UNINDEXED,
        name,
        tokenize='unicode61'
      );

      CREATE VIRTUAL TABLE fts_directors USING fts5(
        directorId UNINDEXED,
        name,
        tokenize='unicode61'
      );

      CREATE VIRTUAL TABLE fts_writers USING fts5(
        writerId UNINDEXED,
        name,
        tokenize='unicode61'
      );

      -- Note: Vector embeddings are stored externally in separate DB files
      -- (e.g., data/embeddings-nomic.db) to keep movies.db lightweight

      -- Config table for metadata
      CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT
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

      -- People indexes
      CREATE INDEX idx_actors_name ON actors(name);
      CREATE INDEX idx_actors_count ON actors(movie_count DESC);
      CREATE INDEX idx_directors_name ON directors(name);
      CREATE INDEX idx_directors_count ON directors(movie_count DESC);
      CREATE INDEX idx_writers_name ON writers(name);
      CREATE INDEX idx_writers_count ON writers(movie_count DESC);

      CREATE INDEX idx_movie_actors_movieId ON movie_actors(movieId);
      CREATE INDEX idx_movie_actors_actorId ON movie_actors(actorId);
      CREATE INDEX idx_movie_directors_movieId ON movie_directors(movieId);
      CREATE INDEX idx_movie_directors_directorId ON movie_directors(directorId);
      CREATE INDEX idx_movie_writers_movieId ON movie_writers(movieId);
      CREATE INDEX idx_movie_writers_writerId ON movie_writers(writerId);
    `)

    // 5. Prepare Statements
    const insertMovie = sqlite.prepare(`
      INSERT INTO movies (
        movieId, title, year, imdbRating, imdbVotes, language, genre, country,
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
      INSERT INTO fts_movies (movieId, title)
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

    const insertConfig = sqlite.prepare(`
      INSERT INTO config (key, value) VALUES (?, ?)
    `)

    const insertActor = sqlite.prepare(`
      INSERT OR IGNORE INTO actors (name) VALUES (?)
    `)
    const getActorId = sqlite.prepare(`SELECT id FROM actors WHERE name = ?`)
    const insertMovieActor = sqlite.prepare(`
      INSERT OR IGNORE INTO movie_actors (movieId, actorId) VALUES (?, ?)
    `)
    const insertFtsActor = sqlite.prepare(`
      INSERT INTO fts_actors (actorId, name) VALUES (?, ?)
    `)

    const insertDirector = sqlite.prepare(`
      INSERT OR IGNORE INTO directors (name) VALUES (?)
    `)
    const getDirectorId = sqlite.prepare(`SELECT id FROM directors WHERE name = ?`)
    const insertMovieDirector = sqlite.prepare(`
      INSERT OR IGNORE INTO movie_directors (movieId, directorId) VALUES (?, ?)
    `)
    const insertFtsDirector = sqlite.prepare(`
      INSERT INTO fts_directors (directorId, name) VALUES (?, ?)
    `)

    const insertWriter = sqlite.prepare(`
      INSERT OR IGNORE INTO writers (name) VALUES (?)
    `)
    const getWriterId = sqlite.prepare(`SELECT id FROM writers WHERE name = ?`)
    const insertMovieWriter = sqlite.prepare(`
      INSERT OR IGNORE INTO movie_writers (movieId, writerId) VALUES (?, ?)
    `)
    const insertFtsWriter = sqlite.prepare(`
      INSERT INTO fts_writers (writerId, name) VALUES (?, ?)
    `)

    // 6. Insert Data in a Transaction
    logger.info('Inserting data...')
    sqlite.exec('BEGIN TRANSACTION')
    try {
      // Insert config metadata
      // Embedding model metadata is stored for reference, but embeddings themselves
      // are kept in external DB files (e.g., data/embeddings-nomic.db)
      insertConfig.run('embedding_model_id', embeddingModel.id)
      insertConfig.run('embedding_model_name', embeddingModel.name)
      insertConfig.run('embedding_model_dimensions', embeddingModel.dimensions.toString())
      insertConfig.run('embeddings_external', 'true')
      insertConfig.run('embeddings_db_file', embeddingModel.dbFileName)
      if (embeddingModel.ollamaModel) {
        insertConfig.run('embedding_model_ollama', embeddingModel.ollamaModel)
      }

      let count = 0
      for (const movie of movies) {
        // Map metadata fields
        const m = movie.metadata || {}
        const imdbRating = typeof m.imdbRating === 'number' ? m.imdbRating : null
        const imdbVotes = m.imdbVotes ?? null

        // Determine language priority: Archive.org language > YouTube language > OMDB language
        let language: string | null = null
        for (const source of movie.sources) {
          if (source.language) {
            language = normalizeLanguageCode(source.language)
            if (source.type === 'archive.org') break // Archive.org language has highest priority
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
          primaryChannelName = primarySource.channelName || null
        }

        insertMovie.run(
          movie.movieId,
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
        insertFts.run(movie.movieId, ftsTitle)

        // Note: Vector embeddings are stored externally, not in the main DB

        // Insert People (Actors, Directors, Writers)
        if (m.Actors && m.Actors !== 'N/A') {
          const actors = m.Actors.split(',')
            .map(a => a.trim())
            .filter(Boolean)
          for (const name of actors) {
            insertActor.run(name)
            const row = getActorId.get(name) as { id: number }
            if (row) {
              insertMovieActor.run(movie.movieId, row.id)
            }
          }
        }

        if (m.Director && m.Director !== 'N/A') {
          const directors = m.Director.split(',')
            .map(d => d.trim())
            .filter(Boolean)
          for (const name of directors) {
            insertDirector.run(name)
            const row = getDirectorId.get(name) as { id: number }
            if (row) {
              insertMovieDirector.run(movie.movieId, row.id)
            }
          }
        }

        if (m.Writer && m.Writer !== 'N/A') {
          const writers = m.Writer.split(',')
            .map(w => w.trim())
            .filter(Boolean)
          for (const name of writers) {
            insertWriter.run(name)
            const row = getWriterId.get(name) as { id: number }
            if (row) {
              insertMovieWriter.run(movie.movieId, row.id)
            }
          }
        }

        count++
        if (count % 100 === 0) {
          onProgress?.({
            current: count,
            total: movies.length,
            message: 'Inserting movies',
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

        // Deduplicate movieIds to avoid UNIQUE constraint violations
        const uniqueMovieIds = [...new Set(collection.movieIds)]
        for (const movieId of uniqueMovieIds) {
          // Only insert if movie exists in our filtered database (not quality-labeled)
          if (validMovieIds.has(movieId)) {
            insertCollectionMovie.run(collection.id, movieId, collection.updatedAt)
          }
        }
      }
      logger.info(`Inserted ${collections.length} collections`)

      // 6.8. Update People Counts and FTS
      logger.info('Updating people counts and FTS...')
      onProgress?.({
        current: movies.length,
        total: movies.length,
        message: 'Updating people counts and FTS',
      })

      // Update counts
      sqlite.exec(`
        UPDATE actors SET movie_count = (SELECT COUNT(*) FROM movie_actors WHERE actorId = actors.id);
        UPDATE directors SET movie_count = (SELECT COUNT(*) FROM movie_directors WHERE directorId = directors.id);
        UPDATE writers SET movie_count = (SELECT COUNT(*) FROM movie_writers WHERE writerId = writers.id);
      `)

      // Populate FTS
      const allActors = sqlite.prepare('SELECT id, name FROM actors').all() as {
        id: number
        name: string
      }[]
      for (const actor of allActors) {
        insertFtsActor.run(actor.id, actor.name)
      }

      const allDirectors = sqlite.prepare('SELECT id, name FROM directors').all() as {
        id: number
        name: string
      }[]
      for (const director of allDirectors) {
        insertFtsDirector.run(director.id, director.name)
      }

      const allWriters = sqlite.prepare('SELECT id, name FROM writers').all() as {
        id: number
        name: string
      }[]
      for (const writer of allWriters) {
        insertFtsWriter.run(writer.id, writer.name)
      }

      logger.info(
        `Processed ${allActors.length} actors, ${allDirectors.length} directors, ${allWriters.length} writers`
      )

      sqlite.exec('COMMIT')
    } catch (err) {
      sqlite.exec('ROLLBACK')
      throw err
    }

    // 8. Optimize
    logger.info('Optimizing database...')
    onProgress?.({
      current: movies.length,
      total: movies.length,
      message: 'Optimizing: FTS movies',
    })
    sqlite.exec("INSERT INTO fts_movies(fts_movies) VALUES('optimize')")
    onProgress?.({
      current: movies.length,
      total: movies.length,
      message: 'Optimizing: FTS actors',
    })
    sqlite.exec("INSERT INTO fts_actors(fts_actors) VALUES('optimize')")
    onProgress?.({
      current: movies.length,
      total: movies.length,
      message: 'Optimizing: FTS directors',
    })
    sqlite.exec("INSERT INTO fts_directors(fts_directors) VALUES('optimize')")
    onProgress?.({
      current: movies.length,
      total: movies.length,
      message: 'Optimizing: FTS writers',
    })
    sqlite.exec("INSERT INTO fts_writers(fts_writers) VALUES('optimize')")
    onProgress?.({ current: movies.length, total: movies.length, message: 'Optimizing: VACUUM' })
    sqlite.exec('VACUUM')
    onProgress?.({ current: movies.length, total: movies.length, message: 'Optimizing: ANALYZE' })
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
