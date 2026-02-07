/**
 * Remove URL Column Migration Script
 *
 * Removes the url column from the sources table since URLs can be
 * dynamically constructed from type and sourceId using getSourceUrl().
 *
 * What it does:
 * - Creates a backup of the database
 * - Recreates the sources table without the url column
 * - Preserves all existing data
 * - Runs VACUUM to reclaim space
 * - Reports size reduction
 *
 * Safety:
 * - Creates backup before making changes
 * - Uses transactions for atomic operations
 * - Validates data integrity after migration
 *
 * Usage:
 *   pnpm tsx scripts/remove-url-column.ts
 */

import Database from 'better-sqlite3'
import { copyFileSync, statSync } from 'fs'
import { join } from 'path'

// Paths
const DB_PATH = join(process.cwd(), 'data/movies.db')
const BACKUP_PATH = join(process.cwd(), 'data/movies.db.backup')

// Logging utilities
function log(message: string) {
  console.log(message)
}

function logSuccess(message: string) {
  console.log(`✓ ${message}`)
}

function logError(message: string) {
  console.error(`❌ ${message}`)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

async function migrate() {
  log('🔧 Starting migration: Remove url column from sources table')
  log('')

  // Check if database exists
  try {
    statSync(DB_PATH)
  } catch {
    logError('Database not found at: ' + DB_PATH)
    process.exit(1)
  }

  // Get original size
  const originalSize = statSync(DB_PATH).size
  log(`📊 Original database size: ${formatBytes(originalSize)}`)
  log('')

  // Create backup
  log('💾 Creating backup...')
  try {
    copyFileSync(DB_PATH, BACKUP_PATH)
    logSuccess(`Backup created at: ${BACKUP_PATH}`)
    log('')
  } catch (error) {
    logError('Failed to create backup: ' + error)
    process.exit(1)
  }

  // Open database
  const db = Database(DB_PATH)

  try {
    // Verify current state
    log('🔍 Verifying current state...')
    const sourceCount = db.prepare('SELECT COUNT(*) as count FROM sources').get() as {
      count: number
    }
    log(`  - Total sources: ${sourceCount.count}`)

    // Sample some URLs to show they exist
    const sampleSources = db
      .prepare('SELECT type, sourceId, url FROM sources LIMIT 3')
      .all() as Array<{ type: string; sourceId: string; url: string }>
    log('  - Sample sources with URLs:')
    sampleSources.forEach(s => {
      log(`    • ${s.type}: ${s.url}`)
    })
    log('')

    // Get quality marks count before migration
    const qualityMarksCount = db
      .prepare('SELECT COUNT(*) as count FROM source_quality_marks')
      .get() as { count: number }

    // Start migration
    log('🔄 Starting migration...')

    // Begin transaction
    db.exec('BEGIN TRANSACTION')

    try {
      // Drop views that reference the sources table
      log('  - Dropping dependent views...')
      db.exec('DROP VIEW IF EXISTS v_movies_lightweight')
      db.exec('DROP VIEW IF EXISTS v_movies_quality_issues')
      db.exec('DROP VIEW IF EXISTS v_source_stats')
      db.exec('DROP VIEW IF EXISTS v_collection_stats')

      // Create new sources table without url column
      log('  - Creating new sources table without url column...')
      db.exec(`
        CREATE TABLE sources_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movieId TEXT NOT NULL,
          type TEXT NOT NULL,
          sourceId TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          size INTEGER,
          addedAt TEXT NOT NULL,
          duration INTEGER,
          language TEXT,
          year INTEGER,
          releaseYear INTEGER,
          
          -- Archive.org specific fields
          collection TEXT,
          downloads INTEGER,
          
          -- YouTube specific fields
          channelName TEXT,
          channelId TEXT,
          publishedAt TEXT,
          viewCount INTEGER,
          regionRestrictionAllowed TEXT,
          regionRestrictionBlocked TEXT,
          
          FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE,
          CHECK (type IN ('archive.org', 'youtube'))
        )
      `)

      // Copy data from old table to new table (excluding url)
      log('  - Copying data (excluding url column)...')
      db.exec(`
        INSERT INTO sources_new (
          id, movieId, type, sourceId, title, description,
          size, addedAt, duration, language, year, releaseYear,
          collection, downloads, channelName, channelId, publishedAt, viewCount,
          regionRestrictionAllowed, regionRestrictionBlocked
        )
        SELECT 
          id, movieId, type, sourceId, title, description,
          size, addedAt, duration, language, year, releaseYear,
          collection, downloads, channelName, channelId, publishedAt, viewCount,
          regionRestrictionAllowed, regionRestrictionBlocked
        FROM sources
      `)

      // Create a temporary table to save quality marks
      log('  - Preserving quality marks...')
      db.exec(`
        CREATE TEMPORARY TABLE quality_marks_temp AS
        SELECT sqm.sourceId, sqm.mark, sqm.addedAt
        FROM source_quality_marks sqm
      `)

      // Disable foreign keys temporarily to avoid cascade issues
      db.exec('PRAGMA foreign_keys = OFF')

      // Drop old table
      log('  - Dropping old table...')
      db.exec('DROP TABLE sources')

      // Rename new table
      log('  - Renaming new table...')
      db.exec('ALTER TABLE sources_new RENAME TO sources')

      // Re-enable foreign keys
      db.exec('PRAGMA foreign_keys = ON')

      // Recreate indexes
      log('  - Recreating indexes...')
      db.exec(`
        CREATE INDEX idx_sources_movieId ON sources(movieId);
        CREATE INDEX idx_sources_type ON sources(type);
        CREATE INDEX idx_sources_sourceId ON sources(sourceId);
        CREATE INDEX idx_sources_channelName ON sources(channelName);
        CREATE INDEX idx_sources_year ON sources(year);
        CREATE INDEX idx_sources_addedAt ON sources(addedAt);
        CREATE UNIQUE INDEX idx_sources_unique ON sources(movieId, type, sourceId);
        CREATE INDEX idx_sources_type_movieId ON sources(type, movieId);
      `)

      // Restore quality marks
      log('  - Restoring quality marks...')
      db.exec(`
        INSERT INTO source_quality_marks (sourceId, mark, addedAt)
        SELECT sourceId, mark, addedAt
        FROM quality_marks_temp
      `)

      // Drop temporary table
      db.exec('DROP TABLE quality_marks_temp')

      // Recreate views
      log('  - Recreating views...')
      db.exec(`
        CREATE VIEW v_movies_lightweight AS
        SELECT 
          m.movieId,
          m.title,
          m.year,
          m.verified,
          m.lastUpdated,
          md.imdbRating,
          md.imdbVotes,
          md.Genre as genre,
          md.Country as country,
          md.Language as language,
          (SELECT type FROM sources WHERE movieId = m.movieId ORDER BY addedAt LIMIT 1) as primarySourceType,
          (SELECT channelName FROM sources WHERE movieId = m.movieId AND type = 'youtube' ORDER BY addedAt LIMIT 1) as primaryChannelName,
          (SELECT COUNT(*) FROM sources WHERE movieId = m.movieId) as sourceCount,
          (SELECT COUNT(*) FROM source_quality_marks sqm 
           JOIN sources s ON sqm.sourceId = s.id 
           WHERE s.movieId = m.movieId) as qualityMarkCount
        FROM movies m
        LEFT JOIN metadata md ON m.movieId = md.movieId;
      `)

      db.exec(`
        CREATE VIEW v_movies_quality_issues AS
        SELECT DISTINCT
          m.movieId,
          m.title,
          m.year,
          (SELECT GROUP_CONCAT(label, ', ') FROM movie_quality_labels WHERE movieId = m.movieId) as movieLabels,
          (SELECT GROUP_CONCAT(DISTINCT mark, ', ') 
           FROM source_quality_marks sqm 
           JOIN sources s ON sqm.sourceId = s.id 
           WHERE s.movieId = m.movieId) as sourceMarks
        FROM movies m
        WHERE EXISTS (SELECT 1 FROM movie_quality_labels WHERE movieId = m.movieId)
           OR EXISTS (SELECT 1 FROM source_quality_marks sqm 
                      JOIN sources s ON sqm.sourceId = s.id 
                      WHERE s.movieId = m.movieId);
      `)

      db.exec(`
        CREATE VIEW v_source_stats AS
        SELECT 
          type,
          COUNT(*) as totalSources,
          COUNT(DISTINCT movieId) as uniqueMovies,
          AVG(duration) as avgDuration,
          SUM(size) as totalSize,
          AVG(size) as avgSize
        FROM sources
        GROUP BY type;
      `)

      db.exec(`
        CREATE VIEW v_collection_stats AS
        SELECT 
          c.id,
          c.name,
          COUNT(cm.movieId) as movieCount,
          c.updatedAt
        FROM collections c
        LEFT JOIN collection_movies cm ON c.id = cm.collectionId
        GROUP BY c.id, c.name, c.updatedAt;
      `)

      // Commit transaction
      db.exec('COMMIT')
      logSuccess('Migration completed')
      log('')

      // Verify data integrity
      log('🔍 Verifying data integrity...')
      const newSourceCount = db.prepare('SELECT COUNT(*) as count FROM sources').get() as {
        count: number
      }
      const newQualityMarksCount = db
        .prepare('SELECT COUNT(*) as count FROM source_quality_marks')
        .get() as { count: number }

      log(`  - Sources before: ${sourceCount.count}`)
      log(`  - Sources after: ${newSourceCount.count}`)
      log(`  - Quality marks before: ${qualityMarksCount.count}`)
      log(`  - Quality marks after: ${newQualityMarksCount.count}`)

      if (newSourceCount.count !== sourceCount.count) {
        throw new Error('Source count mismatch!')
      }
      if (newQualityMarksCount.count !== qualityMarksCount.count) {
        throw new Error('Quality marks count mismatch!')
      }

      // Verify that url column is gone
      const tableInfo = db.prepare('PRAGMA table_info(sources)').all() as Array<{
        name: string
      }>
      const hasUrlColumn = tableInfo.some(col => col.name === 'url')
      if (hasUrlColumn) {
        throw new Error('URL column still exists!')
      }

      logSuccess('Data integrity verified')
      logSuccess('URL column successfully removed')
      log('')

      // Run VACUUM to reclaim space
      log('🗜️  Running VACUUM to reclaim space...')
      db.exec('VACUUM')
      logSuccess('VACUUM completed')
      log('')
    } catch (error) {
      // Rollback on error
      db.exec('ROLLBACK')
      throw error
    }

    db.close()

    // Get new size
    const newSize = statSync(DB_PATH).size
    const reduction = originalSize - newSize
    const reductionPercent = ((reduction / originalSize) * 100).toFixed(2)

    log('📊 Migration results:')
    log(`  - Original size: ${formatBytes(originalSize)}`)
    log(`  - New size: ${formatBytes(newSize)}`)
    log(`  - Space saved: ${formatBytes(reduction)} (${reductionPercent}%)`)
    log('')

    logSuccess('✨ Migration completed successfully!')
    log(`Backup available at: ${BACKUP_PATH}`)
  } catch (error) {
    logError('Migration failed: ' + error)
    db.close()
    process.exit(1)
  }
}

// Run migration
migrate().catch(error => {
  logError('Unexpected error: ' + error)
  process.exit(1)
})
