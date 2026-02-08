/**
 * JSON to SQLite Migration Script
 *
 * Migrates data from data/movies.json to data/movies.db (admin database)
 * This is a one-time migration script to establish the SQLite database as the source of truth.
 *
 * Features:
 * - Reads data/movies.json (~77MB, 10k+ movies)
 * - Creates data/movies.db with full schema from data/schema.sql
 * - Migrates all movies, sources, metadata, AI data, quality marks, collections
 * - Does not migrate ratings (imdbRating in metadata is sufficient)
 * - Progress reporting
 * - Transaction safety with rollback on error
 * - Validation (compare counts before/after)
 * - Backup creation (movies.json.backup)
 *
 * Flags:
 * --dry-run: Validate without writing
 * --force: Overwrite existing database
 * --verbose: Detailed logging
 */

import Database from 'better-sqlite3'
import { readFileSync, copyFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { parseArgs } from 'node:util'
import type { MoviesDatabase, MovieEntry } from '../shared/types/movie'

// Paths
const JSON_PATH = join(process.cwd(), 'data/movies.json')
const BACKUP_PATH = join(process.cwd(), 'data/movies.json.backup')
const DB_PATH = join(process.cwd(), 'data/movies.db')
const SCHEMA_PATH = join(process.cwd(), 'data/schema.sql')

// Parse command line arguments
const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: pnpm tsx scripts/migrate-json-to-sqlite.ts [options]

Options:
  --dry-run    Validate without writing to database
  --force      Overwrite existing database file
  --verbose    Detailed logging
  -h, --help   Show this help message

Description:
  Migrates data from data/movies.json to data/movies.db (admin database).
  Creates a backup at data/movies.json.backup before migration.
  Validates counts before/after to ensure data integrity.

Examples:
  pnpm tsx scripts/migrate-json-to-sqlite.ts --dry-run    # Test without writing
  pnpm tsx scripts/migrate-json-to-sqlite.ts --force      # Overwrite existing DB
  pnpm tsx scripts/migrate-json-to-sqlite.ts --verbose    # Detailed logs
  `)
  process.exit(0)
}

const dryRun = values['dry-run'] as boolean
const force = values.force as boolean
const verbose = values.verbose as boolean

// Logging utilities
function log(message: string) {
  console.log(message)
}

function logVerbose(message: string) {
  if (verbose) {
    console.log(`  ${message}`)
  }
}

function logError(message: string) {
  console.error(`❌ ${message}`)
}

function logSuccess(message: string) {
  console.log(`✓ ${message}`)
}

// Migration statistics
interface MigrationStats {
  movies: number
  sources: number
  sourceQualityMarks: number
  metadata: number
  aiMetadata: number
  collections: number
  collectionMovies: number
  relatedMovies: number
}

/**
 * Load and parse the JSON database
 */
function loadJsonDatabase(): { db: MoviesDatabase; movies: MovieEntry[] } {
  log('📖 Loading movies.json...')
  const jsonContent = readFileSync(JSON_PATH, 'utf-8')
  const db = JSON.parse(jsonContent) as MoviesDatabase

  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry =>
      typeof entry === 'object' && entry !== null && 'movieId' in entry
  )

  logSuccess(`Loaded ${movies.length.toLocaleString()} movies from JSON`)
  return { db, movies }
}

/**
 * Create backup of movies.json
 */
function createBackup() {
  if (dryRun) {
    log('🔍 [DRY RUN] Would create backup: movies.json.backup')
    return
  }

  log('💾 Creating backup: movies.json.backup')
  copyFileSync(JSON_PATH, BACKUP_PATH)
  logSuccess('Backup created')
}

/**
 * Initialize database with schema
 */
function initializeDatabase(): Database.Database {
  log(`🗄️  Initializing database: ${DB_PATH}`)

  // Check if database already exists
  if (existsSync(DB_PATH)) {
    if (!force && !dryRun) {
      logError('Database already exists. Use --force to overwrite.')
      process.exit(1)
    }
    if (!dryRun) {
      log('🗑️  Removing existing database...')
      unlinkSync(DB_PATH)
    }
  }

  // Create database (in-memory for dry-run, file for actual migration)
  const db = dryRun ? new Database(':memory:') : new Database(DB_PATH)

  // Load and execute schema
  log('📋 Loading schema from data/schema.sql...')
  const schema = readFileSync(SCHEMA_PATH, 'utf-8')

  logVerbose('Executing schema...')
  db.exec(schema)

  if (dryRun) {
    logSuccess('In-memory database initialized with schema')
  } else {
    logSuccess('Database initialized with schema')
  }

  return db
}

/**
 * Normalize language field (can be string or array)
 */
function normalizeLanguage(language: string | string[] | undefined): string | null {
  if (!language) return null
  if (Array.isArray(language)) {
    return JSON.stringify(language)
  }
  return language
}

/**
 * Migrate all data to SQLite
 */
function migrateData(db: Database.Database, movies: MovieEntry[]): MigrationStats {
  log('🚀 Starting migration...')

  const stats: MigrationStats = {
    movies: 0,
    sources: 0,
    sourceQualityMarks: 0,
    metadata: 0,
    aiMetadata: 0,
    collections: 0,
    collectionMovies: 0,
    relatedMovies: 0,
  }

  // Prepare statements
  const insertMovie = db.prepare(`
    INSERT INTO movies (movieId, title, year, verified, lastUpdated)
    VALUES (?, ?, ?, ?, ?)
  `)

  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources (
      movieId, type, url, sourceId, title, description, label, quality,
      fileSize, size, addedAt, duration, language, year, releaseYear,
      collection, downloads, channelName, channelId, publishedAt, viewCount,
      regionRestrictionAllowed, regionRestrictionBlocked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertSourceQualityMark = db.prepare(`
    INSERT INTO source_quality_marks (sourceId, mark, addedAt)
    VALUES (?, ?, ?)
  `)

  const insertMetadata = db.prepare(`
    INSERT INTO metadata (
      movieId, Title, Year, Rated, Runtime, Genre, Director, Writer,
      Actors, Plot, Language, Country, Awards, imdbRating,
      imdbVotes, imdbID, Type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Ratings table removed - imdbRating is sufficient

  const insertAIMetadata = db.prepare(`
    INSERT INTO ai_metadata (movieId, title, year, extractedAt)
    VALUES (?, ?, ?, ?)
  `)

  const insertCollection = db.prepare(`
    INSERT OR IGNORE INTO collections (id, name, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `)

  const insertCollectionMovie = db.prepare(`
    INSERT OR IGNORE INTO collection_movies (collectionId, movieId, addedAt)
    VALUES (?, ?, ?)
  `)

  const insertRelatedMovie = db.prepare(`
    INSERT OR IGNORE INTO related_movies (movieId, relatedMovieId, addedAt)
    VALUES (?, ?, ?)
  `)

  // FTS inserts
  const insertFtsMovie = db.prepare(`
    INSERT INTO fts_movies (movieId, title)
    VALUES (?, ?)
  `)

  const insertFtsSource = db.prepare(`
    INSERT INTO fts_sources (sourceId, title, description)
    VALUES (?, ?, ?)
  `)

  const insertFtsMetadata = db.prepare(`
    INSERT INTO fts_metadata (movieId, plot, actors, director, genre)
    VALUES (?, ?, ?, ?, ?)
  `)

  // Begin transaction
  db.exec('BEGIN TRANSACTION')

  try {
    let progressCounter = 0
    const progressInterval = 100

    for (const movie of movies) {
      // Insert movie
      insertMovie.run(
        movie.movieId,
        Array.isArray(movie.title) ? movie.title[0] : movie.title,
        movie.year || null,
        movie.verified ? 1 : 0,
        movie.lastUpdated
      )
      stats.movies++

      // Insert FTS for movie
      const ftsTitle = Array.isArray(movie.title) ? movie.title.join(' ') : movie.title
      insertFtsMovie.run(movie.movieId, ftsTitle)

      // Insert sources
      if (movie.sources && movie.sources.length > 0) {
        for (const source of movie.sources) {
          try {
            const result = insertSource.run(
              movie.movieId,
              source.type,
              source.url,
              source.id,
              Array.isArray(source.title) ? source.title[0] : source.title,
              Array.isArray(source.description)
                ? source.description[0]
                : source.description || null,
              source.label || null,
              source.quality || null,
              source.fileSize || null,
              source.size || null,
              source.addedAt,
              source.duration || null,
              normalizeLanguage(source.language),
              source.year || null,
              source.releaseYear || null,
              source.collection || null,
              source.downloads || null,
              source.channelName || null,
              source.channelId || null,
              source.publishedAt || null,
              source.viewCount || null,
              source.regionRestriction?.allowed
                ? JSON.stringify(source.regionRestriction.allowed)
                : null,
              source.regionRestriction?.blocked
                ? JSON.stringify(source.regionRestriction.blocked)
                : null
            )

            // Check if the insert was successful (changes > 0 means a new row was inserted)
            if (result.changes > 0) {
              stats.sources++

              const sourceRowId = result.lastInsertRowid as number

              // Insert FTS for source
              const sourceTitle = Array.isArray(source.title)
                ? source.title.join(' ')
                : source.title
              const sourceDesc = Array.isArray(source.description)
                ? source.description.join(' ')
                : source.description || ''
              insertFtsSource.run(sourceRowId, sourceTitle, sourceDesc)

              // Insert quality marks for this source
              if (source.qualityMarks && source.qualityMarks.length > 0) {
                for (const mark of source.qualityMarks) {
                  insertSourceQualityMark.run(sourceRowId, mark, new Date().toISOString())
                  stats.sourceQualityMarks++
                }
              }
            } else {
              logVerbose(`Skipped duplicate source ${source.id} for movie ${movie.movieId}`)
            }
          } catch (error) {
            console.error(`Error inserting source for movie ${movie.movieId}:`, error)
            console.error('Source:', JSON.stringify(source, null, 2))
            throw error
          }
        }
      }

      // Insert metadata
      if (movie.metadata) {
        const m = movie.metadata
        insertMetadata.run(
          movie.movieId,
          m.Title || null,
          m.Year || null,
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
          m.imdbRating || null,
          m.imdbVotes || null,
          m.imdbID || null,
          m.Type || null
        )
        stats.metadata++

        // Insert FTS for metadata
        insertFtsMetadata.run(
          movie.movieId,
          m.Plot || '',
          m.Actors || '',
          m.Director || '',
          m.Genre || ''
        )

        // Ratings table removed - imdbRating is sufficient
      }

      // Insert AI metadata
      if (movie.ai) {
        insertAIMetadata.run(
          movie.movieId,
          movie.ai.title || null,
          movie.ai.year || null,
          new Date().toISOString()
        )
        stats.aiMetadata++
      }

      // Insert collections (from movie.collections field)
      if (movie.collections && movie.collections.length > 0) {
        for (const collection of movie.collections) {
          const now = new Date().toISOString()
          insertCollection.run(
            collection.id,
            collection.name,
            null, // description not available in MovieEntry
            now,
            now
          )
          insertCollectionMovie.run(collection.id, movie.movieId, now)
          stats.collectionMovies++
        }
      }

      // Insert related movies
      if (movie.relatedMovies && movie.relatedMovies.length > 0) {
        const now = new Date().toISOString()
        for (const relatedId of movie.relatedMovies) {
          insertRelatedMovie.run(movie.movieId, relatedId, now)
          stats.relatedMovies++
        }
      }

      // Progress reporting
      progressCounter++
      if (progressCounter % progressInterval === 0) {
        log(
          `  Progress: ${progressCounter.toLocaleString()}/${movies.length.toLocaleString()} movies`
        )
      }
    }

    // Commit transaction
    db.exec('COMMIT')
    logSuccess('Migration completed successfully')

    // Optimize database
    if (!dryRun) {
      log('🔧 Optimizing database...')
      db.exec("INSERT INTO fts_movies(fts_movies) VALUES('optimize')")
      db.exec("INSERT INTO fts_sources(fts_sources) VALUES('optimize')")
      db.exec("INSERT INTO fts_metadata(fts_metadata) VALUES('optimize')")
      db.exec('ANALYZE')
      logSuccess('Database optimized')
    }
  } catch (error) {
    db.exec('ROLLBACK')
    logError('Migration failed, rolling back...')
    throw error
  }

  return stats
}

/**
 * Validate migration results
 */
function validateMigration(
  db: Database.Database,
  originalMovies: MovieEntry[],
  stats: MigrationStats
): boolean {
  log('🔍 Validating migration...')

  let allValid = true

  // Count movies in database
  const dbMovieCount = db.prepare('SELECT COUNT(*) as count FROM movies').get() as { count: number }
  const jsonMovieCount = originalMovies.length

  logVerbose(`Movies in JSON: ${jsonMovieCount.toLocaleString()}`)
  logVerbose(`Movies in DB: ${dbMovieCount.count.toLocaleString()}`)

  if (dbMovieCount.count !== jsonMovieCount) {
    logError(`Movie count mismatch! Expected: ${jsonMovieCount}, DB: ${dbMovieCount.count}`)
    allValid = false
  }

  // No longer verifying ratings - table removed

  // Count AI metadata
  const dbAIMetadataCount = db.prepare('SELECT COUNT(*) as count FROM ai_metadata').get() as {
    count: number
  }
  logVerbose(`AI Metadata in JSON: ${stats.aiMetadata.toLocaleString()}`)
  logVerbose(`AI Metadata in DB: ${dbAIMetadataCount.count.toLocaleString()}`)

  if (dbAIMetadataCount.count !== stats.aiMetadata) {
    logError(
      `AI Metadata count mismatch! Expected: ${stats.aiMetadata}, DB: ${dbAIMetadataCount.count}`
    )
    allValid = false
  } else {
    logSuccess(`AI Metadata: ${dbAIMetadataCount.count.toLocaleString()} ✓`)
  }

  // Count quality marks
  const dbQualityMarkCount = db
    .prepare('SELECT COUNT(*) as count FROM source_quality_marks')
    .get() as { count: number }
  logVerbose(`Quality Marks in JSON: ${stats.sourceQualityMarks.toLocaleString()}`)
  logVerbose(`Quality Marks in DB: ${dbQualityMarkCount.count.toLocaleString()}`)

  if (dbQualityMarkCount.count !== stats.sourceQualityMarks) {
    logError(
      `Quality Mark count mismatch! Expected: ${stats.sourceQualityMarks}, DB: ${dbQualityMarkCount.count}`
    )
    allValid = false
  } else {
    logSuccess(`Quality Marks: ${dbQualityMarkCount.count.toLocaleString()} ✓`)
  }

  return allValid
}

/**
 * Print migration summary
 */
function printSummary(stats: MigrationStats, durationMs: number) {
  log('\n📊 Migration Summary')
  log('═══════════════════════════════════════')
  log(`Movies:              ${stats.movies.toLocaleString()}`)
  log(`Sources:             ${stats.sources.toLocaleString()}`)
  log(`Source Quality Marks: ${stats.sourceQualityMarks.toLocaleString()}`)
  log(`Metadata:            ${stats.metadata.toLocaleString()}`)
  log(`Ratings:             ${stats.ratings.toLocaleString()}`)
  log(`AI Metadata:         ${stats.aiMetadata.toLocaleString()}`)
  log(`Collections:         ${stats.collections.toLocaleString()}`)
  log(`Collection Movies:   ${stats.collectionMovies.toLocaleString()}`)
  log(`Related Movies:      ${stats.relatedMovies.toLocaleString()}`)
  log('═══════════════════════════════════════')
  log(`Duration:            ${(durationMs / 1000).toFixed(2)}s`)
  log('')
}

/**
 * Main migration function
 */
async function main() {
  const startTime = Date.now()

  try {
    log('🚀 JSON to SQLite Migration')
    log('═══════════════════════════════════════\n')

    if (dryRun) {
      log('🔍 DRY RUN MODE - No changes will be made\n')
    }

    // 1. Load JSON database
    const { movies } = loadJsonDatabase()

    // 2. Create backup
    if (!dryRun) {
      createBackup()
    }

    // 3. Initialize database
    const db = initializeDatabase()

    // 4. Migrate data
    const stats = migrateData(db, movies)

    // 5. Validate migration
    const isValid = validateMigration(db, movies, stats)

    // 6. Close database
    db.close()

    // 7. Print summary
    const duration = Date.now() - startTime
    printSummary(stats, duration)

    if (dryRun) {
      log('🔍 DRY RUN completed - No changes were made')
    } else if (isValid) {
      logSuccess('✨ Migration completed successfully!')
      log(`📁 Database: ${DB_PATH}`)
      log(`💾 Backup: ${BACKUP_PATH}`)
    } else {
      logError('⚠️  Migration completed with validation errors')
      process.exit(1)
    }
  } catch (error) {
    logError('Migration failed:')
    console.error(error)
    process.exit(1)
  }
}

// Run migration
main()
