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
 * Note: Embeddings are stored in separate DB files (e.g., embeddings-leaf-ir-movies.db)
 * and are generated via AdminEmbeddingsGenerator. This utility only generates the main
 * movies.db with movie data, collections, and full-text search indexes.
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { getAdminDatabase } from './adminDb'
import { createLogger } from './logger'
import { normalizeLanguageCode } from '../../shared/utils/languageNormalizer'
import { generateMovieJSON } from './generateMovieJSON'
import type { MovieMetadata } from '../../shared/types/movie'

const logger = createLogger('SQLiteGen')
const DB_PATH = join(process.cwd(), 'public/data/movies.db')
const GZ_PATH = `${DB_PATH}.gz`

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

  // Query all movies with their sources (excluding quality-marked and truly unplayable sources)
  const moviesQuery = `
    SELECT DISTINCT
      m.movieId,
      m.title,
      m.year,
      m.verified,
      m.lastUpdated
    FROM movies m
    WHERE EXISTS (
      -- Only include movies that have at least one public-visible source without quality marks
      SELECT 1 FROM sources s
      WHERE s.movieId = m.movieId
      AND (
        s.status IN ('active', 'unlisted')
        OR (s.status = 'unavailable' AND s.unavailableReason IN ('not_embeddable', 'age_restricted'))
      )
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

  logger.info(`Processing ${movies.length} movies for web database`)

  onProgress?.({ current: 0, total: movies.length, message: 'Loading data' })

  // 3. Remove existing DBs if they exist
  const tmpGzPath = `${GZ_PATH}.tmp`
  if (existsSync(DB_PATH)) {
    logger.info('Removing existing database file')
    unlinkSync(DB_PATH)
  }
  if (existsSync(GZ_PATH)) {
    logger.info('Removing existing gzipped database file')
    unlinkSync(GZ_PATH)
  }
  if (existsSync(tmpGzPath)) {
    logger.info('Removing existing temporary gzipped database file')
    unlinkSync(tmpGzPath)
  }

  // 4. Initialize Database
  const sqlite = new Database(DB_PATH)

  // Use DELETE mode instead of WAL for better compatibility with WASM
  sqlite.pragma('journal_mode = DELETE')

  let movieCount: number

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

      -- Contentless FTS5 Virtual Table for Search (keyed by movies.rowid)
      CREATE VIRTUAL TABLE fts_search USING fts5(
        title,
        actors,
        directors,
        writers,
        content='',
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
      INSERT INTO fts_search (rowid, title, actors, directors, writers)
      VALUES (?, ?, ?, ?, ?)
    `)

    const insertConfig = sqlite.prepare(`
      INSERT INTO config (key, value) VALUES (?, ?)
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

        // Query sources for this movie (excluding quality-marked and truly unplayable ones)
        const sources = adminDb
          .prepare(
            `
            SELECT c.platform as type, s.language, c.name as channelName
            FROM sources s
            JOIN channels c ON s.channelId = c.id
            WHERE s.movieId = ?
            AND (
              s.status IN ('active', 'unlisted')
              OR (s.status = 'unavailable' AND s.unavailableReason IN ('not_embeddable', 'age_restricted'))
            )
            AND NOT EXISTS (
              SELECT 1 FROM source_quality_marks sqm
              WHERE sqm.sourceId = s.id
            )
            ORDER BY 
              CASE c.platform 
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

        const info = insertMovie.run(
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

        // Insert into contentless FTS5 keyed by movies.rowid
        const actorsText = normalizePeopleField(m.Actors)
        const directorsText = normalizePeopleField(m.Director)
        const writersText = normalizePeopleField(m.Writer)
        insertFts.run(info.lastInsertRowid, movie.title, actorsText, directorsText, writersText)

        // Note: Vector embeddings are stored externally, not in the main DB

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
      message: 'Optimizing: FTS search',
    })
    sqlite.exec("INSERT INTO fts_search(fts_search) VALUES('optimize')")
    onProgress?.({ current: movies.length, total: movies.length, message: 'Optimizing: ANALYZE' })
    sqlite.exec('ANALYZE')
    onProgress?.({ current: movies.length, total: movies.length, message: 'Optimizing: VACUUM' })
    sqlite.exec('VACUUM')

    logger.success('SQLite database generated successfully!')

    const stats = sqlite.prepare('SELECT count(*) as count FROM movies').get() as { count: number }
    movieCount = stats.count
    logger.info(`Final database contains ${movieCount} movies`)
  } catch (error) {
    logger.error('Failed to generate SQLite database:', error)
    throw error
  } finally {
    sqlite.close()
  }

  // 9. Generate gzipped database for faster client transport
  logger.info('Compressing database to movies.db.gz...')
  onProgress?.({
    current: movies.length,
    total: movies.length,
    message: 'Compressing database...',
  })
  const gzStartTime = Date.now()
  try {
    await pipeline(
      createReadStream(DB_PATH),
      createGzip({ level: 9 }),
      createWriteStream(tmpGzPath)
    )
    renameSync(tmpGzPath, GZ_PATH)
  } catch (error) {
    try {
      if (existsSync(tmpGzPath)) {
        unlinkSync(tmpGzPath)
      }
    } catch {
      // Ignore cleanup errors so the original compression error is preserved
    }
    logger.error('Failed to compress SQLite database:', error)
    throw error
  }
  const rawSize = statSync(DB_PATH).size
  const gzSize = statSync(GZ_PATH).size
  const ratio = rawSize > 0 ? ((1 - gzSize / rawSize) * 100).toFixed(1) : '0.0'
  logger.success(
    `Compressed database: ${(gzSize / 1024 / 1024).toFixed(2)} MB (${ratio}% smaller than ${(rawSize / 1024 / 1024).toFixed(2)} MB) in ${Date.now() - gzStartTime}ms`
  )
  onProgress?.({
    current: movies.length,
    total: movies.length,
    message: `Completed: ${movieCount} movies generated`,
  })
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
      Runtime,
      Genre,
      Director,
      Writer,
      Actors,
      Plot,
      Language,
      Country,
      Awards,
      imdbRating,
      imdbVotes,
      imdbID,
      Type
    FROM metadata
  `
    )
    .all() as Array<{
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
  }>

  // Ratings table removed - imdbRating is already loaded from metadata table

  // Process metadata
  for (const metadata of allMetadata) {
    // Build metadata object with only non-null fields
    const result: MovieMetadata = {}

    if (metadata.Title) result.Title = metadata.Title
    if (metadata.Year) result.Year = metadata.Year
    if (metadata.Rated) result.Rated = metadata.Rated
    if (metadata.Runtime) result.Runtime = metadata.Runtime
    if (metadata.Genre) result.Genre = metadata.Genre
    if (metadata.Director) result.Director = metadata.Director
    if (metadata.Writer) result.Writer = metadata.Writer
    if (metadata.Actors) result.Actors = metadata.Actors
    if (metadata.Plot) result.Plot = metadata.Plot
    if (metadata.Language) result.Language = metadata.Language
    if (metadata.Country) result.Country = metadata.Country
    if (metadata.Awards) result.Awards = metadata.Awards
    if (metadata.imdbRating !== null) result.imdbRating = metadata.imdbRating
    if (metadata.imdbVotes !== null) result.imdbVotes = metadata.imdbVotes
    if (metadata.imdbID) result.imdbID = metadata.imdbID
    if (metadata.Type) result.Type = metadata.Type

    metadataMap.set(metadata.movieId, result)
  }

  return metadataMap
}

/**
 * Normalize a comma-separated people field (Actors, Director, Writer) for FTS5 indexing.
 * Returns empty string if missing or 'N/A'.
 */
function normalizePeopleField(value?: string | null): string {
  if (!value || value === 'N/A') return ''
  return value
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .join(', ')
}
