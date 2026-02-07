/**
 * Remove thumbnail column from sources table
 *
 * This script removes the thumbnail column from the sources table in data/movies.db.
 * It recreates the sources table without the thumbnail column and preserves all existing data.
 *
 * Steps:
 * 1. Create backup of database
 * 2. Begin transaction
 * 3. Create new sources table without thumbnail column
 * 4. Copy data from old table to new table (excluding thumbnail)
 * 5. Drop old table
 * 6. Rename new table
 * 7. Recreate indexes and constraints
 * 8. Run VACUUM to reclaim space
 * 9. Report size reduction
 */

import Database from 'better-sqlite3'
import { copyFileSync, statSync } from 'fs'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'data/movies.db')
const BACKUP_PATH = join(process.cwd(), 'data/movies.db.backup-before-thumbnail-removal')

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

async function main() {
  try {
    log('🗄️  Remove thumbnail column from sources table')
    log('═══════════════════════════════════════\n')

    // Get original database size
    const originalSize = statSync(DB_PATH).size
    log(`Original database size: ${formatBytes(originalSize)}`)

    // Create backup
    log('\n💾 Creating backup...')
    copyFileSync(DB_PATH, BACKUP_PATH)
    logSuccess(`Backup created: ${BACKUP_PATH}`)

    // Open database
    log('\n🔧 Opening database...')
    const db = new Database(DB_PATH)

    // Count sources before migration
    const sourceCountBefore = db.prepare('SELECT COUNT(*) as count FROM sources').get() as {
      count: number
    }
    log(`\nSources in database: ${sourceCountBefore.count.toLocaleString()}`)

    // Begin transaction
    log('\n🚀 Starting migration...')
    db.exec('BEGIN TRANSACTION')

    try {
      // Drop views that depend on sources table
      log('  Dropping views...')
      db.exec('DROP VIEW IF EXISTS v_movies_lightweight')
      db.exec('DROP VIEW IF EXISTS v_movies_quality_issues')
      db.exec('DROP VIEW IF EXISTS v_source_stats')

      // Create new sources table without thumbnail column
      log('  Creating new sources table...')
      db.exec(`
        CREATE TABLE sources_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movieId TEXT NOT NULL,
          type TEXT NOT NULL,
          url TEXT NOT NULL,
          sourceId TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          size INTEGER,
          addedAt TEXT NOT NULL,
          duration INTEGER,
          language TEXT,
          year INTEGER,
          releaseYear INTEGER,
          
          collection TEXT,
          downloads INTEGER,
          
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

      // Copy data from old table to new table (excluding thumbnail)
      log('  Copying data to new table...')
      db.exec(`
        INSERT INTO sources_new (
          id, movieId, type, url, sourceId, title, description,
          size, addedAt, duration, language, year, releaseYear,
          collection, downloads, channelName, channelId, publishedAt, viewCount,
          regionRestrictionAllowed, regionRestrictionBlocked
        )
        SELECT 
          id, movieId, type, url, sourceId, title, description,
          size, addedAt, duration, language, year, releaseYear,
          collection, downloads, channelName, channelId, publishedAt, viewCount,
          regionRestrictionAllowed, regionRestrictionBlocked
        FROM sources
      `)

      // Verify data was copied
      const sourceCountNew = db.prepare('SELECT COUNT(*) as count FROM sources_new').get() as {
        count: number
      }
      if (sourceCountNew.count !== sourceCountBefore.count) {
        throw new Error(
          `Data verification failed! Expected ${sourceCountBefore.count} sources, got ${sourceCountNew.count}`
        )
      }
      logSuccess(`  Copied ${sourceCountNew.count.toLocaleString()} sources`)

      // Drop old table
      log('  Dropping old sources table...')
      db.exec('DROP TABLE sources')

      // Rename new table
      log('  Renaming new table...')
      db.exec('ALTER TABLE sources_new RENAME TO sources')

      // Recreate indexes
      log('  Recreating indexes...')
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

      // Recreate views
      log('  Recreating views...')
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
        LEFT JOIN metadata md ON m.movieId = md.movieId
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
                      WHERE s.movieId = m.movieId)
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
        GROUP BY type
      `)

      // Commit transaction
      db.exec('COMMIT')
      logSuccess('Migration completed successfully')

      // Run VACUUM to reclaim space
      log('\n🧹 Running VACUUM to reclaim space...')
      db.exec('VACUUM')
      logSuccess('VACUUM completed')

      // Close database
      db.close()

      // Get new database size
      const newSize = statSync(DB_PATH).size
      const savedSpace = originalSize - newSize
      const percentReduced = ((savedSpace / originalSize) * 100).toFixed(2)

      log('\n📊 Migration Summary')
      log('═══════════════════════════════════════')
      log(`Original size:     ${formatBytes(originalSize)}`)
      log(`New size:          ${formatBytes(newSize)}`)
      log(`Space saved:       ${formatBytes(savedSpace)} (${percentReduced}%)`)
      log(`Sources migrated:  ${sourceCountBefore.count.toLocaleString()}`)
      log(`Backup location:   ${BACKUP_PATH}`)
      log('═══════════════════════════════════════\n')

      logSuccess('✨ Thumbnail column successfully removed!')
    } catch (error) {
      db.exec('ROLLBACK')
      db.close()
      throw error
    }
  } catch (error) {
    logError('Migration failed:')
    console.error(error)
    process.exit(1)
  }
}

// Run migration
main()
