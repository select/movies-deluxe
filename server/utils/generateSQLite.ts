/**
 * SQLite Database Generation Utility
 *
 * Converts data/movies.db (admin DB) to public/data/movies.db (web DB)
 * Optimized for client-side SQLite Wasm usage.
 *
 * Changes from JSON-based approach:
 * - Reads from admin SQLite database instead of movies.json
 * - Uses efficient SQL queries with JOINs
 * - Same filtering logic (quality marks removed)
 * - Same web DB schema and structure
 *
 * Note: Embeddings are stored in separate DB files (e.g., embeddings-bge-micro-movies.db)
 * and are generated via AdminEmbeddingsGenerator. This utility only generates the main
 * movies.db with movie data, collections, and full-text search indexes.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { getAdminDatabase } from './adminDb'
import { createLogger } from './logger'
import { normalizeLanguageCode } from '../../shared/utils/languageNormalizer'
import { generateMovieJSON } from './generateMovieJSON'
import type { MovieMetadata } from '../../shared/types/movie'

const logger = createLogger('SQLiteGen')
const DB_PATH = join(process.cwd(), 'public/data/movies.db')

export interface GenerateSQLiteOptions {
  skipJsonGeneration?: boolean
  onProgress?: (progress: { current: number; total: number; message: string }) => void
}

/**
 * Movie data structure from admin DB
 */
interface MovieData {
  movieId: string
  title: string
  year: number | null
  verified: number
  lastUpdated: string
  metadata?: MovieMetadata
}

/**
 * Collection data structure from admin DB
 */
interface CollectionData {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  movieIds: string[]
}

export async function generateSQLite(options: GenerateSQLiteOptions = {}): Promise<void> {
  const { skipJsonGeneration = false, onProgress } = options

  logger.info('Starting SQLite database generation from admin database...')

  // 1. Generate individual movie JSON files first
  if (!skipJsonGeneration) {
    logger.info('Generating individual movie JSON files...')
    await generateMovieJSON()
  } else {
    logger.info('Skipping individual movie JSON generation')
  }

  // 2. Load data from admin database
  const adminDb = getAdminDatabase()

  logger.info('Querying movies from admin database...')
  const startTime = Date.now()

  // Query all movies with their sources (excluding quality-marked sources)
  const moviesQuery = `
    SELECT DISTINCT
      m.movieId,
      m.title,
      m.year,
      m.verified,
      m.lastUpdated
    FROM movies m
    WHERE EXISTS (
      -- Only include movies that have at least one source without quality marks
      SELECT 1 FROM sources s
      WHERE s.movieId = m.movieId
      AND NOT EXISTS (
        SELECT 1 FROM source_quality_marks sqm
        WHERE sqm.sourceId = s.id
      )
    )
    ORDER BY m.movieId
  `

  const moviesRaw = adminDb.prepare(moviesQuery).all() as Array<{
    movieId: string
    title: string
    year: number | null
    verified: number
    lastUpdated: string
  }>

  logger.info(`Queried ${moviesRaw.length} movies in ${Date.now() - startTime}ms`)

  // Load metadata for all movies in batch
  const metadataMap = loadMetadataMap(adminDb)

  // Build movie data array
  const movies: MovieData[] = moviesRaw.map(movie => ({
    ...movie,
    metadata: metadataMap.get(movie.movieId),
  }))

  // Load collections
  const collections = loadCollections(adminDb)

  // Create a Set of valid movie IDs for quick lookup
  const validMovieIds = new Set(movies.map(m => m.movieId))

  logger.info(`Processing ${movies.length} movies for web database`)

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
      // Note: Embedding model info is stored in the individual embedding DB files
      // The main movies.db doesn't need to know about embeddings
      insertConfig.run('generated_at', new Date().toISOString())

      let count = 0
      for (const movie of movies) {
        // Map metadata fields
        const m = movie.metadata || {}
        const imdbRating = typeof m.imdbRating === 'number' ? m.imdbRating : null
        const imdbVotes = m.imdbVotes ?? null

        // Determine language from sources (priority: archive.org > youtube) or metadata
        let language: string | null = null

        // Query sources for this movie (excluding quality-marked ones)
        const sources = adminDb
          .prepare(
            `
            SELECT s.type, s.language, s.channelName
            FROM sources s
            WHERE s.movieId = ?
            AND NOT EXISTS (
              SELECT 1 FROM source_quality_marks sqm
              WHERE sqm.sourceId = s.id
            )
            ORDER BY 
              CASE s.type 
                WHEN 'archive.org' THEN 1 
                WHEN 'youtube' THEN 2 
                ELSE 3 
              END,
              s.addedAt
          `
          )
          .all(movie.movieId) as Array<{
          type: string
          language: string | null
          channelName: string | null
        }>

        // Determine language priority: Archive.org language > YouTube language > OMDB language
        for (const source of sources) {
          if (source.language) {
            // Parse language if it's JSON (might be array)
            let parsedLanguage = source.language
            try {
              const parsed = JSON.parse(source.language)
              if (Array.isArray(parsed) && parsed.length > 0) {
                parsedLanguage = parsed[0]
              }
            } catch {
              // Not JSON, use as-is
            }
            language = normalizeLanguageCode(parsedLanguage)
            if (source.type === 'archive.org') break // Archive.org language has highest priority
          }
        }
        // Fallback to OMDB metadata language if no source language found
        if (!language && m.Language) {
          language = normalizeLanguageCode(m.Language)
        }

        // Determine primary source info for lightweight grid display
        const primarySource = sources[0]
        const primarySourceType = primarySource?.type || null
        let primaryChannelName = null
        if (primarySource?.type === 'youtube') {
          primaryChannelName = primarySource.channelName || null
        }

        insertMovie.run(
          movie.movieId,
          movie.title,
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
        insertFts.run(movie.movieId, movie.title)

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

      // Count genres and countries from metadata
      const genreCounts = new Map<string, number>()
      const countryCounts = new Map<string, number>()

      for (const movie of movies) {
        const m = movie.metadata
        if (m?.Genre) {
          const genres = m.Genre.split(',').map(g => g.trim())
          genres.forEach(genre => {
            if (genre && genre !== 'N/A') {
              genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
            }
          })
        }

        if (m?.Country) {
          const countries = m.Country.split(',').map(c => c.trim())
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

/**
 * Load metadata for all movies in a batch
 * Returns a Map of movieId -> MovieMetadata
 */
function loadMetadataMap(db: Database.Database): Map<string, MovieMetadata> {
  const metadataMap = new Map<string, MovieMetadata>()

  // Load all metadata in one query
  const allMetadata = db
    .prepare(
      `
    SELECT 
      movieId,
      Title,
      Year,
      Rated,
      Released,
      Runtime,
      Genre,
      Director,
      Writer,
      Actors,
      Plot,
      Language,
      Country,
      Awards,
      Poster,
      Metascore,
      imdbRating,
      imdbVotes,
      imdbID,
      Type,
      Response
    FROM metadata
  `
    )
    .all() as Array<{
    movieId: string
    Title: string | null
    Year: string | null
    Rated: string | null
    Released: string | null
    Runtime: string | null
    Genre: string | null
    Director: string | null
    Writer: string | null
    Actors: string | null
    Plot: string | null
    Language: string | null
    Country: string | null
    Awards: string | null
    Poster: string | null
    Metascore: string | null
    imdbRating: number | null
    imdbVotes: number | null
    imdbID: string | null
    Type: string | null
    Response: string | null
  }>

  // Load all ratings in one query
  const allRatings = db
    .prepare(
      `
    SELECT movieId, Source, Value
    FROM ratings
    ORDER BY movieId
  `
    )
    .all() as Array<{ movieId: string; Source: string; Value: string }>

  // Build ratings map
  const ratingsMap = new Map<string, Array<{ Source: string; Value: string }>>()
  for (const rating of allRatings) {
    if (!ratingsMap.has(rating.movieId)) {
      ratingsMap.set(rating.movieId, [])
    }
    ratingsMap.get(rating.movieId)!.push({ Source: rating.Source, Value: rating.Value })
  }

  // Process metadata
  for (const metadata of allMetadata) {
    // Build metadata object with only non-null fields
    const result: MovieMetadata = {}

    if (metadata.Title) result.Title = metadata.Title
    if (metadata.Year) result.Year = metadata.Year
    if (metadata.Rated) result.Rated = metadata.Rated
    if (metadata.Released) result.Released = metadata.Released
    if (metadata.Runtime) result.Runtime = metadata.Runtime
    if (metadata.Genre) result.Genre = metadata.Genre
    if (metadata.Director) result.Director = metadata.Director
    if (metadata.Writer) result.Writer = metadata.Writer
    if (metadata.Actors) result.Actors = metadata.Actors
    if (metadata.Plot) result.Plot = metadata.Plot
    if (metadata.Language) result.Language = metadata.Language
    if (metadata.Country) result.Country = metadata.Country
    if (metadata.Awards) result.Awards = metadata.Awards
    if (metadata.Poster) result.Poster = metadata.Poster
    if (metadata.Metascore) result.Metascore = metadata.Metascore
    if (metadata.imdbRating !== null) result.imdbRating = metadata.imdbRating
    if (metadata.imdbVotes !== null) result.imdbVotes = metadata.imdbVotes
    if (metadata.imdbID) result.imdbID = metadata.imdbID
    if (metadata.Type) result.Type = metadata.Type
    if (metadata.Response) result.Response = metadata.Response

    // Add ratings if any
    const ratings = ratingsMap.get(metadata.movieId)
    if (ratings && ratings.length > 0) {
      result.Ratings = ratings
    }

    metadataMap.set(metadata.movieId, result)
  }

  return metadataMap
}

/**
 * Load collections from admin database
 * Returns an array of collection data with movieIds
 */
function loadCollections(db: Database.Database): CollectionData[] {
  // Load all collections
  const collectionsRaw = db
    .prepare(
      `
    SELECT id, name, description, createdAt, updatedAt
    FROM collections
    ORDER BY name
  `
    )
    .all() as Array<{
    id: string
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
  }>

  // Load all collection movies
  const collectionMovies = db
    .prepare(
      `
    SELECT collectionId, movieId
    FROM collection_movies
    ORDER BY collectionId
  `
    )
    .all() as Array<{ collectionId: string; movieId: string }>

  // Build map of collectionId -> movieIds
  const movieIdsMap = new Map<string, string[]>()
  for (const cm of collectionMovies) {
    if (!movieIdsMap.has(cm.collectionId)) {
      movieIdsMap.set(cm.collectionId, [])
    }
    movieIdsMap.get(cm.collectionId)!.push(cm.movieId)
  }

  // Build collection data array
  return collectionsRaw.map(col => ({
    ...col,
    movieIds: movieIdsMap.get(col.id) || [],
  }))
}
