import { readFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { createLogger } from '../server/utils/logger'

const logger = createLogger('EmbeddingsMigration')

const EMBEDDINGS_JSON = join(process.cwd(), 'data/embeddings.json')
const EMBEDDINGS_DB = join(process.cwd(), 'data/embeddings-nomic-movies.db')

async function main() {
  logger.info('Starting embeddings migration from JSON to SQLite...')

  // 1. Check if source file exists
  if (!existsSync(EMBEDDINGS_JSON)) {
    logger.error(`Source file not found: ${EMBEDDINGS_JSON}`)
    process.exit(1)
  }

  // 2. Load embeddings from JSON
  logger.info('Loading embeddings from JSON...')
  let embeddings: Record<string, number[]>
  try {
    const content = readFileSync(EMBEDDINGS_JSON, 'utf-8')
    embeddings = JSON.parse(content)
    logger.info(`Loaded ${Object.keys(embeddings).length} embeddings from JSON`)
  } catch (err) {
    logger.error('Failed to load embeddings.json:', err)
    process.exit(1)
  }

  const totalCount = Object.keys(embeddings).length
  if (totalCount === 0) {
    logger.warn('No embeddings found in JSON file')
    process.exit(0)
  }

  // 3. Remove existing DB if it exists
  if (existsSync(EMBEDDINGS_DB)) {
    logger.info('Removing existing database...')
    unlinkSync(EMBEDDINGS_DB)
  }

  // 4. Create SQLite database
  logger.info('Creating SQLite database...')
  const db = new Database(EMBEDDINGS_DB)

  try {
    // Create schema
    db.exec(`
      CREATE TABLE embeddings (
        movie_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_embeddings_created_at ON embeddings(created_at);
    `)

    // Prepare insert statement
    const insert = db.prepare(`
      INSERT INTO embeddings (movie_id, embedding, created_at)
      VALUES (?, ?, ?)
    `)

    // 5. Insert embeddings in a transaction
    logger.info('Inserting embeddings into database...')
    const now = new Date().toISOString()
    let count = 0
    let errorCount = 0

    db.exec('BEGIN TRANSACTION')
    try {
      for (const [movieId, embedding] of Object.entries(embeddings)) {
        try {
          // Validate embedding
          if (!Array.isArray(embedding) || embedding.length === 0) {
            logger.warn(`Invalid embedding for ${movieId}, skipping`)
            errorCount++
            continue
          }

          // Convert to Float32Array and then to Buffer
          const float32Array = new Float32Array(embedding)
          const buffer = Buffer.from(float32Array.buffer)

          insert.run(movieId, buffer, now)
          count++

          if (count % 1000 === 0) {
            logger.info(`Inserted ${count}/${totalCount} embeddings...`)
          }
        } catch (err) {
          logger.error(`Failed to insert embedding for ${movieId}:`, err)
          errorCount++
        }
      }

      db.exec('COMMIT')
      logger.success('Transaction committed successfully')
    } catch (err) {
      db.exec('ROLLBACK')
      logger.error('Transaction failed, rolling back:', err)
      throw err
    }

    // 6. Verify migration
    logger.info('Verifying migration...')
    const result = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
      count: number
    }

    logger.success('Migration complete!')
    logger.info(`Summary:`)
    logger.info(`  - Source JSON: ${totalCount} embeddings`)
    logger.info(`  - Database: ${result.count} embeddings`)
    logger.info(`  - Inserted: ${count}`)
    logger.info(`  - Errors: ${errorCount}`)

    if (result.count !== count) {
      logger.error('Count mismatch! Database count does not match inserted count.')
      process.exit(1)
    }

    if (count + errorCount !== totalCount) {
      logger.warn('Some embeddings were not processed')
    }

    // 7. Show database stats
    const dbStats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        MIN(LENGTH(embedding)) as min_size,
        MAX(LENGTH(embedding)) as max_size,
        AVG(LENGTH(embedding)) as avg_size
      FROM embeddings
    `
      )
      .get() as {
      total: number
      min_size: number
      max_size: number
      avg_size: number
    }

    logger.info(`Database statistics:`)
    logger.info(`  - Total embeddings: ${dbStats.total}`)
    logger.info(
      `  - Embedding size: ${dbStats.min_size} - ${dbStats.max_size} bytes (avg: ${Math.round(dbStats.avg_size)})`
    )

    // Sample embedding to verify dimensions
    const sample = db.prepare('SELECT movie_id, embedding FROM embeddings LIMIT 1').get() as {
      movie_id: string
      embedding: Buffer
    }
    if (sample) {
      const dimensions = sample.embedding.length / 4 // 4 bytes per float32
      logger.info(`  - Embedding dimensions: ${dimensions}`)
    }
  } catch (err) {
    logger.error('Migration failed:', err)
    throw err
  } finally {
    db.close()
  }

  logger.success(`Database created at: ${EMBEDDINGS_DB}`)
}

main().catch(err => {
  logger.error('Fatal error:', err)
  process.exit(1)
})
