/**
 * Remove Unused OMDB Columns Migration Script
 *
 * This script removes the DVD, BoxOffice, Production, and Website columns
 * from the metadata table in the admin database to reduce database size.
 *
 * Usage: pnpm tsx scripts/remove-omdb-columns.ts
 *
 * Safety:
 * - Creates a backup of the database before making changes
 * - Uses transactions for atomic operations
 * - Validates schema changes after migration
 *
 * Exit codes:
 * 0 - Migration successful
 * 1 - Migration failed
 */

import Database from 'better-sqlite3'
import { existsSync, copyFileSync } from 'fs'
import { join } from 'path'

// ============================================================================
// CONFIGURATION
// ============================================================================

const ADMIN_DB_PATH = join(process.cwd(), 'data', 'movies.db')
const BACKUP_DB_PATH = join(process.cwd(), 'data', 'movies.db.backup-before-column-removal')

// Columns to remove
const COLUMNS_TO_REMOVE = ['DVD', 'BoxOffice', 'Production', 'Website']

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message: string): void {
  console.log(`[MIGRATION] ${message}`)
}

function error(message: string): void {
  console.error(`[ERROR] ${message}`)
}

function success(message: string): void {
  console.log(`[SUCCESS] ${message}`)
}

/**
 * Get column names from metadata table
 */
function getTableColumns(db: Database.Database, tableName: string): string[] {
  const result = db.pragma(`table_info(${tableName})`)
  return result.map((row: { name: string }) => row.name)
}

/**
 * Verify that columns were removed successfully
 */
function verifyColumnsRemoved(db: Database.Database): boolean {
  const columns = getTableColumns(db, 'metadata')
  const remainingColumns = COLUMNS_TO_REMOVE.filter(col => columns.includes(col))

  if (remainingColumns.length > 0) {
    error(`Failed to remove columns: ${remainingColumns.join(', ')}`)
    return false
  }

  success('All target columns removed successfully')
  return true
}

/**
 * Count rows in metadata table
 */
function countMetadataRows(db: Database.Database): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM metadata').get() as { count: number }
  return result.count
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

async function migrateDatabase(): Promise<void> {
  log('Starting OMDB columns removal migration...')

  // Check if database exists
  if (!existsSync(ADMIN_DB_PATH)) {
    error(`Admin database not found at: ${ADMIN_DB_PATH}`)
    process.exit(1)
  }

  // Create backup
  log(`Creating backup at: ${BACKUP_DB_PATH}`)
  try {
    copyFileSync(ADMIN_DB_PATH, BACKUP_DB_PATH)
    success('Backup created successfully')
  } catch (err) {
    error(`Failed to create backup: ${err}`)
    process.exit(1)
  }

  // Open database
  const db = Database(ADMIN_DB_PATH)
  db.pragma('journal_mode = WAL')

  try {
    // Get initial state
    const initialColumns = getTableColumns(db, 'metadata')
    const initialRowCount = countMetadataRows(db)

    log(`Current metadata columns: ${initialColumns.join(', ')}`)
    log(`Current metadata rows: ${initialRowCount}`)

    // Check which columns actually exist
    const columnsToRemove = COLUMNS_TO_REMOVE.filter(col => initialColumns.includes(col))

    if (columnsToRemove.length === 0) {
      success('No columns to remove - migration already completed or columns never existed')
      db.close()
      return
    }

    log(`Columns to remove: ${columnsToRemove.join(', ')}`)

    // Begin transaction
    log('Starting transaction...')
    db.exec('BEGIN TRANSACTION')

    try {
      // SQLite doesn't support DROP COLUMN directly in older versions
      // We need to recreate the table without those columns

      log('Creating new metadata table without unused columns...')

      // Step 1: Rename old table
      db.exec('ALTER TABLE metadata RENAME TO metadata_old')

      // Step 2: Create new table with correct schema (without DVD, BoxOffice, Production, Website)
      db.exec(`
        CREATE TABLE metadata (
          movieId TEXT PRIMARY KEY,
          Title TEXT,
          Year TEXT,
          Rated TEXT,
          Released TEXT,
          Runtime TEXT,
          Genre TEXT,
          Director TEXT,
          Writer TEXT,
          Actors TEXT,
          Plot TEXT,
          Language TEXT,
          Country TEXT,
          Awards TEXT,
          Poster TEXT,
          Metascore TEXT,
          imdbRating REAL,
          imdbVotes INTEGER,
          imdbID TEXT,
          Type TEXT,
          Response TEXT,
          
          FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE
        )
      `)

      // Step 3: Copy data from old table to new table (excluding removed columns)
      log('Copying data to new table...')
      db.exec(`
        INSERT INTO metadata (
          movieId, Title, Year, Rated, Released, Runtime, Genre, Director, Writer,
          Actors, Plot, Language, Country, Awards, Poster, Metascore, imdbRating,
          imdbVotes, imdbID, Type, Response
        )
        SELECT 
          movieId, Title, Year, Rated, Released, Runtime, Genre, Director, Writer,
          Actors, Plot, Language, Country, Awards, Poster, Metascore, imdbRating,
          imdbVotes, imdbID, Type, Response
        FROM metadata_old
      `)

      // Step 4: Recreate indexes
      log('Recreating indexes...')
      db.exec(`
        CREATE INDEX idx_metadata_imdbRating ON metadata(imdbRating);
        CREATE INDEX idx_metadata_imdbVotes ON metadata(imdbVotes);
        CREATE INDEX idx_metadata_Genre ON metadata(Genre);
        CREATE INDEX idx_metadata_Country ON metadata(Country);
        CREATE INDEX idx_metadata_Director ON metadata(Director);
        CREATE INDEX idx_metadata_Year ON metadata(Year);
        CREATE INDEX idx_metadata_year_rating ON metadata(Year, imdbRating);
        CREATE INDEX idx_metadata_genre_rating ON metadata(Genre, imdbRating);
      `)

      // Step 5: Drop old table
      log('Dropping old table...')
      db.exec('DROP TABLE metadata_old')

      // Step 6: Verify migration
      const finalRowCount = countMetadataRows(db)
      log(`Final metadata rows: ${finalRowCount}`)

      if (finalRowCount !== initialRowCount) {
        throw new Error(`Row count mismatch! Initial: ${initialRowCount}, Final: ${finalRowCount}`)
      }

      // Commit transaction
      log('Committing transaction...')
      db.exec('COMMIT')

      // Verify columns were removed
      if (!verifyColumnsRemoved(db)) {
        throw new Error('Column verification failed')
      }

      // Vacuum database to reclaim space
      log('Vacuuming database to reclaim space...')
      db.exec('VACUUM')

      success('Migration completed successfully!')
      success(`Metadata rows preserved: ${finalRowCount}`)

      // Show final columns
      const finalColumns = getTableColumns(db, 'metadata')
      log(`Final metadata columns: ${finalColumns.join(', ')}`)
    } catch (err) {
      // Rollback on error
      error(`Migration failed: ${err}`)
      log('Rolling back transaction...')
      db.exec('ROLLBACK')
      throw err
    }
  } catch (err) {
    error(`Migration error: ${err}`)
    error('Database has been rolled back to original state')
    error(`Backup available at: ${BACKUP_DB_PATH}`)
    process.exit(1)
  } finally {
    db.close()
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

migrateDatabase().catch(err => {
  error(`Unhandled error: ${err}`)
  process.exit(1)
})
