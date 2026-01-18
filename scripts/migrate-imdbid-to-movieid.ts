/**
 * Migration Script: Rename imdbId to movieId in data/movies.json
 *
 * This script migrates the data/movies.json file from using 'imdbId' property
 * to 'movieId' property to match the updated TypeScript types and codebase.
 *
 * What it does:
 * 1. Reads data/movies.json
 * 2. For each movie entry, renames the 'imdbId' property to 'movieId'
 * 3. Creates a backup of the original file
 * 4. Writes the updated data back to data/movies.json
 *
 * Usage:
 *   pnpm tsx scripts/migrate-imdbid-to-movieid.ts [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { MovieEntry, DatabaseSchema } from '../shared/types/movie'

const MOVIES_FILE = join(process.cwd(), 'data/movies.json')
const BACKUP_FILE = join(process.cwd(), 'data/movies.json.backup')

interface OldMovieEntry extends Omit<MovieEntry, 'movieId'> {
  imdbId: string
}

interface MoviesDatabase {
  _schema?: DatabaseSchema
  _example?: MovieEntry
  [movieId: string]: MovieEntry | DatabaseSchema | MovieEntry | undefined
}

function migrateMoviesJson(dryRun: boolean = false) {
  console.log('🔄 Starting migration: imdbId → movieId')
  console.log(`📁 File: ${MOVIES_FILE}`)

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be written\n')
  }

  // Read the movies database
  console.log('📖 Reading movies database...')
  const content = readFileSync(MOVIES_FILE, 'utf-8')
  const db = JSON.parse(content)

  // Count entries
  const movieKeys = Object.keys(db).filter(key => !key.startsWith('_'))
  console.log(`📊 Found ${movieKeys.length} movie entries\n`)

  // Track statistics
  let migratedCount = 0
  let alreadyMigratedCount = 0
  let errorCount = 0
  const errors: string[] = []

  // Migrate each movie entry
  const migratedDb: MoviesDatabase = {}

  // Preserve schema and metadata
  for (const key of Object.keys(db)) {
    if (key.startsWith('_')) {
      migratedDb[key] = db[key]
      continue
    }

    const movie = db[key] as OldMovieEntry | MovieEntry

    try {
      // Check if already migrated
      if ('movieId' in movie && !('imdbId' in movie)) {
        alreadyMigratedCount++
        migratedDb[key] = movie as MovieEntry
        continue
      }

      // Check if has imdbId to migrate
      if ('imdbId' in movie) {
        const { imdbId, ...rest } = movie as OldMovieEntry
        const migratedMovie: MovieEntry = {
          movieId: imdbId,
          ...rest,
        }
        migratedDb[key] = migratedMovie
        migratedCount++

        // Log first few migrations as examples
        if (migratedCount <= 3) {
          console.log(`✅ Migrated: ${key}`)
          console.log(`   imdbId: "${imdbId}" → movieId: "${migratedMovie.movieId}"`)
        }
      } else {
        // No imdbId or movieId found - this is an error
        errorCount++
        errors.push(`Movie ${key} has neither imdbId nor movieId property`)
        migratedDb[key] = movie
      }
    } catch (error) {
      errorCount++
      errors.push(
        `Error migrating ${key}: ${error instanceof Error ? error.message : String(error)}`
      )
      migratedDb[key] = movie
    }
  }

  // Update schema timestamp
  if (migratedDb._schema) {
    migratedDb._schema.lastUpdated = new Date().toISOString()
  }

  // Print summary
  console.log('\n📊 Migration Summary:')
  console.log(`   ✅ Migrated: ${migratedCount} entries`)
  console.log(`   ⏭️  Already migrated: ${alreadyMigratedCount} entries`)
  console.log(`   ❌ Errors: ${errorCount} entries`)

  if (errors.length > 0) {
    console.log('\n⚠️  Errors encountered:')
    errors.forEach(err => console.log(`   - ${err}`))
  }

  // Write results
  if (!dryRun) {
    if (migratedCount > 0) {
      // Create backup
      console.log('\n💾 Creating backup...')
      copyFileSync(MOVIES_FILE, BACKUP_FILE)
      console.log(`   Backup saved to: ${BACKUP_FILE}`)

      // Write migrated data
      console.log('\n✍️  Writing migrated data...')
      writeFileSync(MOVIES_FILE, JSON.stringify(migratedDb, null, 2), 'utf-8')
      console.log('   ✅ Migration complete!')
    } else {
      console.log('\n✅ No migration needed - all entries already use movieId')
    }
  } else {
    console.log('\n🔍 DRY RUN - No changes written')
    console.log('   Run without --dry-run to apply changes')
  }

  return {
    migratedCount,
    alreadyMigratedCount,
    errorCount,
    errors,
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

try {
  const result = migrateMoviesJson(dryRun)

  if (result.errorCount > 0) {
    process.exit(1)
  }
} catch (error) {
  console.error('\n❌ Migration failed:', error)
  process.exit(1)
}
