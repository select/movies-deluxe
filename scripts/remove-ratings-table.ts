/**
 * Remove Ratings Table Migration Script
 *
 * This script removes the ratings table from the database since imdbRating
 * in the metadata table is sufficient.
 *
 * Features:
 * - Creates backup before dropping table
 * - Drops ratings table and its indexes
 * - Runs VACUUM to reclaim space
 * - Reports size reduction
 *
 * Usage:
 *   pnpm tsx scripts/remove-ratings-table.ts
 *   pnpm tsx scripts/remove-ratings-table.ts --dry-run
 */

import Database from 'better-sqlite3'
import { existsSync, copyFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

// Paths
const DB_PATH = resolve(process.cwd(), 'data/movies.db')
const BACKUP_PATH = resolve(process.cwd(), 'data/movies.db.before-ratings-removal')

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

// Logging helpers
function log(message: string) {
  console.log(message)
}

function logSuccess(message: string) {
  console.log(`✓ ${message}`)
}

function logError(message: string) {
  console.error(`✗ ${message}`)
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Get file size in bytes
 */
function getFileSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/**
 * Create backup of database
 */
function createBackup(): void {
  if (!existsSync(DB_PATH)) {
    logError(`Database not found: ${DB_PATH}`)
    process.exit(1)
  }

  if (dryRun) {
    log(`🔍 [DRY RUN] Would create backup: ${BACKUP_PATH}`)
    return
  }

  log(`💾 Creating backup: ${BACKUP_PATH}`)
  copyFileSync(DB_PATH, BACKUP_PATH)
  const backupSize = getFileSize(BACKUP_PATH)
  logSuccess(`Backup created (${formatBytes(backupSize)})`)
}

/**
 * Count ratings in database
 */
function countRatings(db: Database.Database): number {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM ratings').get() as {
      count: number
    }
    return result.count
  } catch {
    return 0
  }
}

/**
 * Drop ratings table and reclaim space
 */
function removeRatingsTable(): void {
  log(`\n🗄️  Opening database: ${DB_PATH}`)

  const beforeSize = getFileSize(DB_PATH)
  log(`Database size before: ${formatBytes(beforeSize)}`)

  if (dryRun) {
    log('\n🔍 [DRY RUN] Would execute:')
    log('  1. DROP INDEX IF EXISTS idx_ratings_movieId')
    log('  2. DROP INDEX IF EXISTS idx_ratings_Source')
    log('  3. DROP INDEX IF EXISTS idx_ratings_unique')
    log('  4. DROP TABLE IF EXISTS ratings')
    log('  5. VACUUM')
    return
  }

  const db = new Database(DB_PATH)

  try {
    // Count ratings before dropping
    const ratingsCount = countRatings(db)
    log(`\n📊 Ratings in database: ${ratingsCount.toLocaleString()}`)

    // Start transaction
    db.exec('BEGIN TRANSACTION')

    // Drop indexes first
    log('\n🗑️  Dropping indexes...')
    db.exec('DROP INDEX IF EXISTS idx_ratings_movieId')
    db.exec('DROP INDEX IF EXISTS idx_ratings_Source')
    db.exec('DROP INDEX IF EXISTS idx_ratings_unique')
    logSuccess('Indexes dropped')

    // Drop table
    log('🗑️  Dropping ratings table...')
    db.exec('DROP TABLE IF EXISTS ratings')
    logSuccess('Table dropped')

    // Commit transaction
    db.exec('COMMIT')

    // Run VACUUM to reclaim space
    log('\n🧹 Running VACUUM to reclaim space...')
    log('   (This may take a moment...)')
    db.exec('VACUUM')
    logSuccess('VACUUM completed')

    // Close database to ensure size is updated
    db.close()

    // Report size reduction
    const afterSize = getFileSize(DB_PATH)
    const reduction = beforeSize - afterSize
    const reductionPercent = ((reduction / beforeSize) * 100).toFixed(2)

    log('\n📊 Size Reduction:')
    log(`   Before:     ${formatBytes(beforeSize)}`)
    log(`   After:      ${formatBytes(afterSize)}`)
    log(`   Reduction:  ${formatBytes(reduction)} (${reductionPercent}%)`)

    logSuccess('\n✨ Ratings table removed successfully!')
    log(`📁 Database: ${DB_PATH}`)
    log(`💾 Backup: ${BACKUP_PATH}`)
  } catch (error) {
    // Rollback on error
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback errors
    }

    logError(`\nMigration failed: ${error}`)
    process.exit(1)
  } finally {
    // Ensure database is closed
    try {
      if (db.open) {
        db.close()
      }
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Main function
 */
async function main() {
  log('🚀 Remove Ratings Table Migration')
  log('═══════════════════════════════════════\n')

  if (dryRun) {
    log('🔍 DRY RUN MODE - No changes will be made\n')
  }

  // Check if database exists
  if (!existsSync(DB_PATH)) {
    logError(`Database not found: ${DB_PATH}`)
    process.exit(1)
  }

  // Create backup
  createBackup()

  // Remove ratings table
  removeRatingsTable()

  if (dryRun) {
    log('\n🔍 DRY RUN completed - No changes were made')
  } else {
    log('\n💡 Next steps:')
    log('   1. Run `pnpm typecheck` to verify no type errors')
    log('   2. Test the application to ensure everything works')
    log('   3. If issues occur, restore from backup:')
    log(`      cp ${BACKUP_PATH} ${DB_PATH}`)
  }
}

// Run main function
main().catch(error => {
  logError(`Unexpected error: ${error}`)
  process.exit(1)
})
