#!/usr/bin/env tsx
/**
 * Fix Quality Marks Migration
 *
 * This script transfers quality marks from movies.json to the database.
 * It was created to fix a bug where the original migration script failed
 * to insert quality marks due to schema mismatch.
 *
 * Background:
 * - The migration script had outdated INSERT statements for sources table
 * - Sources were inserted but quality marks were skipped
 * - This script queries existing sources and adds their quality marks
 */

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// File paths
const DB_PATH = resolve(import.meta.dirname, '../data/movies.db')
const JSON_PATH = resolve(import.meta.dirname, '../data/movies.json')

interface MovieSource {
  id: string
  type: string
  qualityMarks?: string[]
  [key: string]: unknown
}

interface MovieEntry {
  movieId: string
  sources?: MovieSource[]
  [key: string]: unknown
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

function log(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`)
}

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`)
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`)
}

function logError(message: string) {
  console.error(`${colors.red}✗${colors.reset} ${message}`)
}

function main() {
  console.log(`\n${colors.bright}=== Fix Quality Marks Migration ===${colors.reset}\n`)

  // Load JSON data
  log('Loading movies.json...')
  const jsonData = readFileSync(JSON_PATH, 'utf-8')
  const moviesObj: Record<string, MovieEntry> = JSON.parse(jsonData)
  const movies = Object.values(moviesObj).filter(m => m.movieId) // Filter out _schema
  const movieCount = movies.length
  logSuccess(`Loaded ${movieCount.toLocaleString()} movies from JSON`)

  // Count quality marks in JSON
  let totalMarksInJson = 0
  const marksMap = new Map<string, { movieId: string; sourceId: string; marks: string[] }>()

  for (const movie of movies) {
    if (!movie.sources) continue

    for (const source of movie.sources) {
      if (source.qualityMarks && source.qualityMarks.length > 0) {
        const key = `${movie.movieId}|${source.id}`
        marksMap.set(key, {
          movieId: movie.movieId,
          sourceId: source.id,
          marks: source.qualityMarks,
        })
        totalMarksInJson += source.qualityMarks.length
      }
    }
  }

  log(`Found ${totalMarksInJson} quality marks in JSON across ${marksMap.size} sources`)

  // Open database
  log('Opening database...')
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  // Check current quality marks in database
  const currentCount = db.prepare('SELECT COUNT(*) as count FROM source_quality_marks').get() as {
    count: number
  }
  log(`Current quality marks in database: ${currentCount.count}`)

  // Prepare statements
  const getSourceId = db.prepare(`
    SELECT id FROM sources 
    WHERE movieId = ? AND sourceId = ?
  `)

  const insertQualityMark = db.prepare(`
    INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt)
    VALUES (?, ?, datetime('now'))
  `)

  // Process quality marks
  log('Inserting quality marks...')

  let inserted = 0
  let skipped = 0
  let notFound = 0

  db.exec('BEGIN TRANSACTION')

  try {
    for (const [_key, data] of marksMap.entries()) {
      // Find the source in the database
      const sourceRow = getSourceId.get(data.movieId, data.sourceId) as { id: number } | undefined

      if (!sourceRow) {
        notFound++
        continue
      }

      // Insert each quality mark
      for (const mark of data.marks) {
        const result = insertQualityMark.run(sourceRow.id, mark)
        if (result.changes > 0) {
          inserted++
        } else {
          skipped++
        }
      }
    }

    db.exec('COMMIT')
    logSuccess('Transaction committed')
  } catch (error) {
    db.exec('ROLLBACK')
    logError('Transaction rolled back due to error')
    throw error
  }

  // Final verification
  const finalCount = db.prepare('SELECT COUNT(*) as count FROM source_quality_marks').get() as {
    count: number
  }

  console.log(`\n${colors.bright}=== Results ===${colors.reset}`)
  console.log(`Quality marks in JSON:     ${totalMarksInJson}`)
  console.log(`Quality marks inserted:    ${colors.green}${inserted}${colors.reset}`)
  console.log(`Quality marks skipped:     ${skipped} (already existed)`)
  console.log(
    `Sources not found:         ${notFound > 0 ? colors.yellow : colors.reset}${notFound}${colors.reset}`
  )
  console.log(`Total in database now:     ${colors.green}${finalCount.count}${colors.reset}`)

  if (finalCount.count === totalMarksInJson) {
    logSuccess('All quality marks successfully transferred!')
  } else if (finalCount.count < totalMarksInJson) {
    logWarning(
      `Missing ${totalMarksInJson - finalCount.count} quality marks (likely due to sources not found in DB)`
    )
  } else {
    logWarning(`Database has more marks than JSON (${finalCount.count - totalMarksInJson} extra)`)
  }

  db.close()
}

// Run the script
try {
  main()
} catch (error) {
  logError(`Fatal error: ${error}`)
  process.exit(1)
}
