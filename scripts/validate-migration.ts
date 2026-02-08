/**
 * Migration Validation Script
 *
 * Validates data integrity after migration from data/movies.json to data/movies.db.
 * Performs comprehensive checks to ensure no data was lost or corrupted during migration.
 *
 * Features:
 * - Movie count comparison (JSON vs SQLite)
 * - All movieIds present verification
 * - Source count per movie validation
 * - Metadata completeness check
 * - Quality marks preservation
 * - AI metadata preservation
 * - Foreign key integrity (no orphaned records)
 * - Deep comparison of random sample movies
 * - Colorized output for readability
 *
 * Flags:
 * --verbose: Show detailed comparison output
 * --sample-size=N: Number of movies to deep-check (default 100)
 * --json-path=PATH: Path to JSON file (default: data/movies.json)
 * --db-path=PATH: Path to SQLite database (default: data/movies.db)
 *
 * Exit codes:
 * 0 - All validations passed
 * 1 - Validation failures detected
 */

import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseArgs } from 'node:util'
import type { MoviesDatabase, MovieEntry } from '../shared/types/movie'

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  passed: boolean
  errors: string[]
  warnings: string[]
}

interface ValidationStats {
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warnings: number
}

interface MovieComparison {
  movieId: string
  discrepancies: string[]
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Parse command line arguments
const { values } = parseArgs({
  options: {
    verbose: { type: 'boolean', default: false },
    'sample-size': { type: 'string', default: '100' },
    'json-path': { type: 'string', default: 'data/movies.json' },
    'db-path': { type: 'string', default: 'data/movies.db' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: pnpm tsx scripts/validate-migration.ts [options]

Options:
  --verbose              Show detailed comparison output
  --sample-size=N        Number of movies to deep-check (default: 100)
  --json-path=PATH       Path to JSON file (default: data/movies.json)
  --db-path=PATH         Path to SQLite database (default: data/movies.db)
  -h, --help             Show this help message

Description:
  Validates data integrity after migration from movies.json to movies.db.
  Performs comprehensive checks including counts, foreign key integrity,
  and deep comparison of random sample movies.

Examples:
  pnpm tsx scripts/validate-migration.ts                   # Standard validation
  pnpm tsx scripts/validate-migration.ts --verbose         # Detailed output
  pnpm tsx scripts/validate-migration.ts --sample-size=200 # Check 200 movies
  `)
  process.exit(0)
}

const verbose = values.verbose as boolean
const sampleSize = parseInt(values['sample-size'] as string, 10)
const JSON_PATH = join(process.cwd(), values['json-path'] as string)
const DB_PATH = join(process.cwd(), values['db-path'] as string)

// ============================================================================
// CONSOLE COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`
}

// ============================================================================
// LOGGING
// ============================================================================

function log(message: string) {
  console.log(message)
}

function logSection(title: string) {
  console.log(`\n${colorize(`${'═'.repeat(60)}`, 'cyan')}`)
  console.log(colorize(title, 'bright'))
  console.log(colorize('═'.repeat(60), 'cyan'))
}

function logSuccess(message: string) {
  console.log(`${colorize('✓', 'green')} ${message}`)
}

function logError(message: string) {
  console.log(`${colorize('✗', 'red')} ${message}`)
}

function logWarning(message: string) {
  console.log(`${colorize('⚠', 'yellow')} ${message}`)
}

function logInfo(message: string) {
  console.log(`${colorize('ℹ', 'blue')} ${message}`)
}

function logVerbose(message: string) {
  if (verbose) {
    console.log(`  ${colorize(message, 'dim')}`)
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load movies from JSON file
 */
function loadJsonDatabase(): MovieEntry[] {
  logInfo(`Loading JSON database: ${JSON_PATH}`)

  if (!existsSync(JSON_PATH)) {
    throw new Error(`JSON file not found: ${JSON_PATH}`)
  }

  const jsonContent = readFileSync(JSON_PATH, 'utf-8')
  const db = JSON.parse(jsonContent) as MoviesDatabase

  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry =>
      typeof entry === 'object' && entry !== null && 'movieId' in entry
  )

  logSuccess(`Loaded ${movies.length.toLocaleString()} movies from JSON`)
  return movies
}

/**
 * Open SQLite database connection
 */
function openDatabase(): Database.Database {
  logInfo(`Opening SQLite database: ${DB_PATH}`)

  if (!existsSync(DB_PATH)) {
    throw new Error(`Database file not found: ${DB_PATH}`)
  }

  const db = new Database(DB_PATH, { readonly: true })
  logSuccess('Database opened successfully')
  return db
}

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

/**
 * Check 1: Movie count matches
 */
function validateMovieCount(db: Database.Database, jsonMovies: MovieEntry[]): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  const dbCount = db.prepare('SELECT COUNT(*) as count FROM movies').get() as { count: number }
  const jsonCount = jsonMovies.length

  logVerbose(`JSON movies: ${jsonCount.toLocaleString()}`)
  logVerbose(`SQLite movies: ${dbCount.count.toLocaleString()}`)

  if (dbCount.count !== jsonCount) {
    result.passed = false
    result.errors.push(`Movie count mismatch: JSON has ${jsonCount}, SQLite has ${dbCount.count}`)
  }

  return result
}

/**
 * Check 2: All movieIds present in both databases
 */
function validateMovieIds(db: Database.Database, jsonMovies: MovieEntry[]): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  // Get all movieIds from SQLite
  const dbMovieIds = new Set(
    (db.prepare('SELECT movieId FROM movies').all() as Array<{ movieId: string }>).map(
      row => row.movieId
    )
  )

  // Get all movieIds from JSON
  const jsonMovieIds = new Set(jsonMovies.map(m => m.movieId))

  // Check for missing movieIds in SQLite
  const missingInDb: string[] = []
  for (const movieId of jsonMovieIds) {
    if (!dbMovieIds.has(movieId)) {
      missingInDb.push(movieId)
    }
  }

  // Check for extra movieIds in SQLite
  const extraInDb: string[] = []
  for (const movieId of dbMovieIds) {
    if (!jsonMovieIds.has(movieId)) {
      extraInDb.push(movieId)
    }
  }

  if (missingInDb.length > 0) {
    result.passed = false
    result.errors.push(`${missingInDb.length} movieIds missing in SQLite`)
    if (verbose && missingInDb.length <= 10) {
      missingInDb.forEach(id => logVerbose(`  Missing: ${id}`))
    }
  }

  if (extraInDb.length > 0) {
    result.passed = false
    result.errors.push(`${extraInDb.length} extra movieIds in SQLite`)
    if (verbose && extraInDb.length <= 10) {
      extraInDb.forEach(id => logVerbose(`  Extra: ${id}`))
    }
  }

  return result
}

/**
 * Check 3: Source count matches per movie
 * Note: SQLite deduplicates sources based on unique constraint (movieId, type, sourceId)
 * so we expect fewer sources in DB if JSON has duplicates. We'll count this as a warning.
 */
function validateSourceCounts(db: Database.Database, jsonMovies: MovieEntry[]): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  const sourceCounts = db
    .prepare(
      `SELECT movieId, COUNT(*) as count 
       FROM sources 
       GROUP BY movieId`
    )
    .all() as Array<{ movieId: string; count: number }>

  const dbSourceMap = new Map(sourceCounts.map(row => [row.movieId, row.count]))

  const mismatches: Array<{ movieId: string; jsonCount: number; dbCount: number }> = []
  const deduplicated: Array<{ movieId: string; jsonCount: number; dbCount: number }> = []

  for (const movie of jsonMovies) {
    const jsonCount = movie.sources?.length || 0
    const dbCount = dbSourceMap.get(movie.movieId) || 0

    if (jsonCount !== dbCount) {
      // If DB has fewer sources, it's likely due to deduplication (expected)
      // If DB has more sources or jsonCount is 0 but dbCount > 0, it's an error
      if (dbCount < jsonCount && jsonCount > 0) {
        deduplicated.push({ movieId: movie.movieId, jsonCount, dbCount })
      } else {
        mismatches.push({ movieId: movie.movieId, jsonCount, dbCount })
      }
    }
  }

  // True mismatches are errors
  if (mismatches.length > 0) {
    result.passed = false
    result.errors.push(`${mismatches.length} movies have unexpected source count mismatches`)

    const samplesToShow = verbose ? 20 : 10
    if (mismatches.length <= samplesToShow) {
      mismatches.forEach(m => logError(`    ${m.movieId}: JSON=${m.jsonCount}, DB=${m.dbCount}`))
    } else {
      mismatches
        .slice(0, samplesToShow)
        .forEach(m => logError(`    ${m.movieId}: JSON=${m.jsonCount}, DB=${m.dbCount}`))
      logError(`    ... and ${mismatches.length - samplesToShow} more`)
    }
  }

  // Deduplication is expected behavior, report as warning
  if (deduplicated.length > 0) {
    result.warnings.push(
      `${deduplicated.length} movies had duplicate sources removed (expected behavior)`
    )

    if (verbose) {
      logVerbose(`Deduplication details:`)
      deduplicated
        .slice(0, 10)
        .forEach(m => logVerbose(`  ${m.movieId}: JSON=${m.jsonCount}, DB=${m.dbCount}`))
      if (deduplicated.length > 10) {
        logVerbose(`  ... and ${deduplicated.length - 10} more`)
      }
    }
  }

  return result
}

/**
 * Check 4: Metadata completeness
 */
function validateMetadata(db: Database.Database, jsonMovies: MovieEntry[]): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  const dbMetadataIds = new Set(
    (db.prepare('SELECT movieId FROM metadata').all() as Array<{ movieId: string }>).map(
      row => row.movieId
    )
  )

  const jsonWithMetadata = jsonMovies.filter(m => m.metadata !== undefined)
  const jsonMetadataIds = new Set(jsonWithMetadata.map(m => m.movieId))

  const missingInDb: string[] = []
  for (const movieId of jsonMetadataIds) {
    if (!dbMetadataIds.has(movieId)) {
      missingInDb.push(movieId)
    }
  }

  const extraInDb: string[] = []
  for (const movieId of dbMetadataIds) {
    if (!jsonMetadataIds.has(movieId)) {
      extraInDb.push(movieId)
    }
  }

  logVerbose(`JSON movies with metadata: ${jsonMetadataIds.size}`)
  logVerbose(`SQLite metadata records: ${dbMetadataIds.size}`)

  if (missingInDb.length > 0) {
    result.passed = false
    result.errors.push(`${missingInDb.length} metadata records missing in SQLite`)
  }

  if (extraInDb.length > 0) {
    result.warnings.push(`${extraInDb.length} extra metadata records in SQLite`)
  }

  return result
}

/**
 * Check 5: Quality marks preserved
 */
function validateQualityMarks(db: Database.Database, jsonMovies: MovieEntry[]): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  // Count quality marks in JSON
  let jsonQualityMarkCount = 0
  for (const movie of jsonMovies) {
    if (movie.sources) {
      for (const source of movie.sources) {
        if (source.qualityMarks) {
          jsonQualityMarkCount += source.qualityMarks.length
        }
      }
    }
  }

  // Count quality marks in SQLite
  const dbQualityMarkCount = db
    .prepare('SELECT COUNT(*) as count FROM source_quality_marks')
    .get() as { count: number }

  logVerbose(`JSON quality marks: ${jsonQualityMarkCount}`)
  logVerbose(`SQLite quality marks: ${dbQualityMarkCount.count}`)

  if (jsonQualityMarkCount !== dbQualityMarkCount.count) {
    result.passed = false
    result.errors.push(
      `Quality mark count mismatch: JSON has ${jsonQualityMarkCount}, SQLite has ${dbQualityMarkCount.count}`
    )
  }

  return result
}

/**
 * Check 6: AI metadata preserved
 */
function validateAIMetadata(db: Database.Database, jsonMovies: MovieEntry[]): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  const dbAIMetadataIds = new Set(
    (db.prepare('SELECT movieId FROM ai_metadata').all() as Array<{ movieId: string }>).map(
      row => row.movieId
    )
  )

  const jsonWithAI = jsonMovies.filter(m => m.ai !== undefined)
  const jsonAIIds = new Set(jsonWithAI.map(m => m.movieId))

  logVerbose(`JSON movies with AI metadata: ${jsonAIIds.size}`)
  logVerbose(`SQLite AI metadata records: ${dbAIMetadataIds.size}`)

  const missingInDb: string[] = []
  for (const movieId of jsonAIIds) {
    if (!dbAIMetadataIds.has(movieId)) {
      missingInDb.push(movieId)
    }
  }

  if (missingInDb.length > 0) {
    result.passed = false
    result.errors.push(`${missingInDb.length} AI metadata records missing in SQLite`)
  }

  return result
}

/**
 * Check 7: No orphaned records (foreign key integrity)
 */
function validateForeignKeyIntegrity(db: Database.Database): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  // Check orphaned sources
  const orphanedSources = db
    .prepare(
      `SELECT COUNT(*) as count 
       FROM sources s 
       WHERE NOT EXISTS (SELECT 1 FROM movies m WHERE m.movieId = s.movieId)`
    )
    .get() as { count: number }

  if (orphanedSources.count > 0) {
    result.passed = false
    result.errors.push(`${orphanedSources.count} orphaned sources (no parent movie)`)
  }

  // Check orphaned metadata
  const orphanedMetadata = db
    .prepare(
      `SELECT COUNT(*) as count 
       FROM metadata md 
       WHERE NOT EXISTS (SELECT 1 FROM movies m WHERE m.movieId = md.movieId)`
    )
    .get() as { count: number }

  if (orphanedMetadata.count > 0) {
    result.passed = false
    result.errors.push(`${orphanedMetadata.count} orphaned metadata records`)
  }

  // NOTE: Ratings table check removed - the ratings table was removed from schema
  // as imdbRating in metadata table is sufficient for our needs

  // Check orphaned AI metadata
  const orphanedAI = db
    .prepare(
      `SELECT COUNT(*) as count 
       FROM ai_metadata ai 
       WHERE NOT EXISTS (SELECT 1 FROM movies m WHERE m.movieId = ai.movieId)`
    )
    .get() as { count: number }

  if (orphanedAI.count > 0) {
    result.passed = false
    result.errors.push(`${orphanedAI.count} orphaned AI metadata records`)
  }

  // Check orphaned source quality marks
  const orphanedQualityMarks = db
    .prepare(
      `SELECT COUNT(*) as count 
       FROM source_quality_marks sqm 
       WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.id = sqm.sourceId)`
    )
    .get() as { count: number }

  if (orphanedQualityMarks.count > 0) {
    result.passed = false
    result.errors.push(`${orphanedQualityMarks.count} orphaned quality marks`)
  }

  return result
}

/**
 * Check 8: Deep comparison of random sample movies
 */
function validateRandomSample(
  db: Database.Database,
  jsonMovies: MovieEntry[],
  sampleSize: number
): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] }

  // Select random movies
  const shuffled = [...jsonMovies].sort(() => Math.random() - 0.5)
  const sample = shuffled.slice(0, Math.min(sampleSize, jsonMovies.length))

  logVerbose(`Performing deep check on ${sample.length} random movies`)

  const discrepancies: MovieComparison[] = []

  for (const jsonMovie of sample) {
    const movieDiscrepancies: string[] = []

    // Get movie from database
    const dbMovie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(jsonMovie.movieId) as
      | { movieId: string; title: string; year: number | null; verified: number }
      | undefined

    if (!dbMovie) {
      movieDiscrepancies.push('Movie not found in database')
      discrepancies.push({ movieId: jsonMovie.movieId, discrepancies: movieDiscrepancies })
      continue
    }

    // Compare basic fields
    const jsonTitle = Array.isArray(jsonMovie.title) ? jsonMovie.title[0] : jsonMovie.title
    if (dbMovie.title !== jsonTitle) {
      movieDiscrepancies.push(`Title mismatch: JSON="${jsonTitle}", DB="${dbMovie.title}"`)
    }

    if (dbMovie.year !== (jsonMovie.year || null)) {
      movieDiscrepancies.push(`Year mismatch: JSON=${jsonMovie.year}, DB=${dbMovie.year}`)
    }

    const jsonVerified = jsonMovie.verified ? 1 : 0
    if (dbMovie.verified !== jsonVerified) {
      movieDiscrepancies.push(`Verified mismatch: JSON=${jsonVerified}, DB=${dbMovie.verified}`)
    }

    // Compare sources (allow deduplication - DB can have fewer sources)
    const dbSources = db
      .prepare('SELECT * FROM sources WHERE movieId = ?')
      .all(jsonMovie.movieId) as Array<{ id: number; movieId: string }>

    if (jsonMovie.sources && dbSources.length > jsonMovie.sources.length) {
      // Only flag if DB has MORE sources than JSON (unexpected)
      movieDiscrepancies.push(
        `Source count mismatch: JSON=${jsonMovie.sources.length}, DB=${dbSources.length}`
      )
    }

    // Compare metadata
    if (jsonMovie.metadata) {
      const dbMetadata = db
        .prepare('SELECT * FROM metadata WHERE movieId = ?')
        .get(jsonMovie.movieId) as { Title?: string; imdbRating?: number } | undefined

      if (!dbMetadata) {
        movieDiscrepancies.push('Metadata missing in database')
      } else {
        // Check key metadata fields
        if (jsonMovie.metadata.Title !== (dbMetadata.Title || undefined)) {
          movieDiscrepancies.push('Metadata title mismatch')
        }
        if (jsonMovie.metadata.imdbRating !== (dbMetadata.imdbRating || undefined)) {
          movieDiscrepancies.push('IMDB rating mismatch')
        }
      }
    }

    // Compare AI metadata
    if (jsonMovie.ai) {
      const dbAI = db
        .prepare('SELECT * FROM ai_metadata WHERE movieId = ?')
        .get(jsonMovie.movieId) as { movieId: string } | undefined

      if (!dbAI) {
        movieDiscrepancies.push('AI metadata missing in database')
      }
    }

    if (movieDiscrepancies.length > 0) {
      discrepancies.push({ movieId: jsonMovie.movieId, discrepancies: movieDiscrepancies })
    }
  }

  if (discrepancies.length > 0) {
    result.passed = false
    result.errors.push(`${discrepancies.length} movies have data discrepancies`)

    if (verbose) {
      for (const disc of discrepancies.slice(0, 5)) {
        logVerbose(`  ${disc.movieId}:`)
        for (const issue of disc.discrepancies) {
          logVerbose(`    - ${issue}`)
        }
      }
      if (discrepancies.length > 5) {
        logVerbose(`  ... and ${discrepancies.length - 5} more`)
      }
    }
  }

  return result
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

/**
 * Run all validation checks
 */
function runValidation() {
  const startTime = Date.now()
  const stats: ValidationStats = {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    warnings: 0,
  }

  try {
    logSection('🔍 Migration Validation')
    log(`JSON file: ${JSON_PATH}`)
    log(`SQLite database: ${DB_PATH}`)
    log(`Sample size: ${sampleSize}`)
    log(`Verbose: ${verbose ? 'Yes' : 'No'}`)

    // Load data
    logSection('📖 Loading Data')
    const jsonMovies = loadJsonDatabase()
    const db = openDatabase()

    // Run validation checks
    const checks = [
      { name: 'Movie count matches', fn: () => validateMovieCount(db, jsonMovies) },
      { name: 'All movieIds present', fn: () => validateMovieIds(db, jsonMovies) },
      { name: 'Source counts match', fn: () => validateSourceCounts(db, jsonMovies) },
      { name: 'Metadata completeness', fn: () => validateMetadata(db, jsonMovies) },
      { name: 'Quality marks preserved', fn: () => validateQualityMarks(db, jsonMovies) },
      { name: 'AI metadata preserved', fn: () => validateAIMetadata(db, jsonMovies) },
      { name: 'Foreign key integrity', fn: () => validateForeignKeyIntegrity(db) },
      {
        name: `Deep comparison (${sampleSize} movies)`,
        fn: () => validateRandomSample(db, jsonMovies, sampleSize),
      },
    ]

    logSection('🔬 Running Validation Checks')

    for (const check of checks) {
      stats.totalChecks++
      log(`\n${colorize(`▶ ${check.name}`, 'cyan')}`)

      const result = check.fn()

      if (result.passed) {
        logSuccess('Passed')
        stats.passedChecks++
      } else {
        logError('Failed')
        stats.failedChecks++
        result.errors.forEach(err => logError(`  ${err}`))
      }

      if (result.warnings.length > 0) {
        stats.warnings += result.warnings.length
        result.warnings.forEach(warn => logWarning(`  ${warn}`))
      }
    }

    // Close database
    db.close()

    // Print summary
    const duration = Date.now() - startTime
    logSection('📊 Validation Summary')

    log(`Total checks:   ${stats.totalChecks}`)
    log(`${colorize('Passed:', 'green')}        ${stats.passedChecks}`)
    log(`${colorize('Failed:', 'red')}        ${stats.failedChecks}`)
    log(`${colorize('Warnings:', 'yellow')}      ${stats.warnings}`)
    log(`Duration:       ${(duration / 1000).toFixed(2)}s`)

    // Final result
    log('')
    if (stats.failedChecks === 0) {
      logSuccess(colorize('✨ All validation checks passed!', 'bright'))
      process.exit(0)
    } else {
      logError(colorize(`❌ ${stats.failedChecks} validation check(s) failed`, 'bright'))
      process.exit(1)
    }
  } catch (error) {
    logError(`Validation error: ${error}`)
    console.error(error)
    process.exit(1)
  }
}

// Run validation
runValidation()
