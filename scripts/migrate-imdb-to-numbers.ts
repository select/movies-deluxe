#!/usr/bin/env tsx
/**
 * Migrate movies.json to use numbers for imdbRating and imdbVotes
 *
 * This script:
 * 1. Reads data/movies.json
 * 2. Converts imdbRating from string to number (handles "N/A")
 * 3. Converts imdbVotes from string to number (removes commas)
 * 4. Writes the updated data back to data/movies.json
 */

import fs from 'node:fs'
import path from 'node:path'
import type { MovieEntry } from '../shared/types/movie'

const DATA_DIR = path.join(process.cwd(), 'data')
const MOVIES_JSON = path.join(DATA_DIR, 'movies.json')
const BACKUP_JSON = path.join(DATA_DIR, 'movies.json.backup')

interface OldMovieMetadata {
  imdbRating?: string | number
  imdbVotes?: string | number
  [key: string]: unknown
}

interface OldMovieEntry extends Omit<MovieEntry, 'metadata'> {
  metadata?: OldMovieMetadata
}

function parseImdbRating(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return value
  if (value === 'N/A' || value === '') return undefined
  const parsed = parseFloat(value)
  return isNaN(parsed) ? undefined : parsed
}

function parseImdbVotes(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return value
  if (value === 'N/A' || value === '') return undefined
  // Remove commas and parse
  const cleaned = typeof value === 'string' ? value.replace(/,/g, '') : String(value)
  const parsed = parseInt(cleaned, 10)
  return isNaN(parsed) ? undefined : parsed
}

async function migrateMoviesJson() {
  console.log('Starting migration of movies.json...')

  // Check if file exists
  if (!fs.existsSync(MOVIES_JSON)) {
    console.error(`Error: ${MOVIES_JSON} does not exist`)
    process.exit(1)
  }

  // Create backup
  console.log('Creating backup...')
  fs.copyFileSync(MOVIES_JSON, BACKUP_JSON)
  console.log(`Backup created at ${BACKUP_JSON}`)

  // Read the file
  console.log('Reading movies.json...')
  const rawData = fs.readFileSync(MOVIES_JSON, 'utf8')
  const data = JSON.parse(rawData) as Record<string, OldMovieEntry>

  // Migrate entries
  console.log('Migrating entries...')
  let totalEntries = 0
  let migratedRatings = 0
  let migratedVotes = 0
  let skippedRatings = 0
  let skippedVotes = 0

  for (const [key, entry] of Object.entries(data)) {
    if (key.startsWith('_')) continue
    totalEntries++

    if (entry.metadata) {
      // Migrate imdbRating
      if (entry.metadata.imdbRating !== undefined) {
        const oldValue = entry.metadata.imdbRating
        const newValue = parseImdbRating(oldValue)

        if (typeof oldValue === 'string') {
          entry.metadata.imdbRating = newValue
          if (newValue !== undefined) {
            migratedRatings++
          } else {
            skippedRatings++
          }
        }
      }

      // Migrate imdbVotes
      if (entry.metadata.imdbVotes !== undefined) {
        const oldValue = entry.metadata.imdbVotes
        const newValue = parseImdbVotes(oldValue)

        if (typeof oldValue === 'string') {
          entry.metadata.imdbVotes = newValue
          if (newValue !== undefined) {
            migratedVotes++
          } else {
            skippedVotes++
          }
        }
      }
    }
  }

  // Write the migrated data
  console.log('Writing migrated data...')
  fs.writeFileSync(MOVIES_JSON, JSON.stringify(data, null, 2), 'utf8')

  console.log('\n✅ Migration complete!')
  console.log(`Total entries: ${totalEntries}`)
  console.log(`Migrated imdbRating: ${migratedRatings}`)
  console.log(`Skipped imdbRating (N/A or invalid): ${skippedRatings}`)
  console.log(`Migrated imdbVotes: ${migratedVotes}`)
  console.log(`Skipped imdbVotes (N/A or invalid): ${skippedVotes}`)
  console.log(`\nBackup saved at: ${BACKUP_JSON}`)
}

// Run migration
migrateMoviesJson().catch(error => {
  console.error('Migration failed:', error)
  process.exit(1)
})
