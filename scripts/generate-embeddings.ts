import { mkdir } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import ollama from 'ollama'
import Database from 'better-sqlite3'
import { loadMoviesDatabase } from '../server/utils/movieData'
import { movieToMarkdown } from '../server/utils/movieEmbeddings'
import { createLogger } from '../server/utils/logger'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('Embeddings')
const EMBEDDINGS_FILE = join(process.cwd(), 'data/embeddings.json')
const EMBEDDINGS_DB = join(process.cwd(), 'data/embeddings-nomic-movies.db')
const MODEL = 'nomic-embed-text'

async function main() {
  logger.info('Starting embedding generation...')

  // 1. Ensure data directory exists
  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }

  // 2. Initialize or open SQLite database
  let db: Database.Database
  const isNewDb = !existsSync(EMBEDDINGS_DB)

  if (isNewDb) {
    logger.info('Creating new embeddings database...')
    db = new Database(EMBEDDINGS_DB)
    db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        movie_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_created_at ON embeddings(created_at);
    `)
  } else {
    logger.info('Opening existing embeddings database...')
    db = new Database(EMBEDDINGS_DB)
  }

  // 3. Load existing embeddings from database for caching
  const existingEmbeddings = db.prepare('SELECT movie_id FROM embeddings').all() as {
    movie_id: string
  }[]
  const embeddingsCache = new Set(existingEmbeddings.map(e => e.movie_id))
  logger.info(`Loaded ${embeddingsCache.size} existing embeddings from database.`)

  // 4. Backward compatibility: Load from JSON if DB is new and JSON exists
  if (isNewDb && existsSync(EMBEDDINGS_FILE)) {
    logger.info('Migrating embeddings from JSON to database...')
    try {
      const content = readFileSync(EMBEDDINGS_FILE, 'utf-8')
      const jsonEmbeddings: Record<string, number[]> = JSON.parse(content)
      const now = new Date().toISOString()

      const insert = db.prepare(`
        INSERT OR IGNORE INTO embeddings (movie_id, embedding, created_at)
        VALUES (?, ?, ?)
      `)

      db.exec('BEGIN TRANSACTION')
      let migratedCount = 0
      for (const [movieId, embedding] of Object.entries(jsonEmbeddings)) {
        if (!embeddingsCache.has(movieId)) {
          const float32Array = new Float32Array(embedding)
          const buffer = Buffer.from(float32Array.buffer)
          insert.run(movieId, buffer, now)
          embeddingsCache.add(movieId)
          migratedCount++
        }
      }
      db.exec('COMMIT')
      logger.info(`Migrated ${migratedCount} embeddings from JSON to database.`)
    } catch (err) {
      logger.warn('Failed to migrate from JSON:', err)
    }
  }

  // 5. Load movies
  const moviesDb = await loadMoviesDatabase()
  const movies = Object.values(moviesDb).filter(
    (entry): entry is MovieEntry =>
      typeof entry === 'object' && entry !== null && 'movieId' in entry
  )

  const limit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '0')
    : 0

  logger.info(`Processing ${movies.length} movies...`)
  if (limit > 0) logger.info(`Limit set to ${limit} movies.`)

  // 6. Prepare insert statement
  const insert = db.prepare(`
    INSERT OR REPLACE INTO embeddings (movie_id, embedding, created_at)
    VALUES (?, ?, ?)
  `)

  let newCount = 0
  let skipCount = 0
  let errorCount = 0

  for (let i = 0; i < movies.length; i++) {
    if (limit > 0 && newCount >= limit) break

    const movie = movies[i]!

    // Skip if already in cache
    if (embeddingsCache.has(movie.movieId)) {
      skipCount++
      continue
    }

    try {
      const text = movieToMarkdown(movie)
      const response = await ollama.embeddings({
        model: MODEL,
        prompt: text,
      })

      // Convert to Float32Array and store as BLOB
      const float32Array = new Float32Array(response.embedding)
      const buffer = Buffer.from(float32Array.buffer)
      const now = new Date().toISOString()

      insert.run(movie.movieId, buffer, now)
      embeddingsCache.add(movie.movieId)
      newCount++

      if (newCount % 10 === 0) {
        logger.info(`Generated ${newCount} new embeddings... (${i + 1}/${movies.length})`)
      }
    } catch (err) {
      logger.error(`Failed to generate embedding for ${movie.movieId}:`, err)
      errorCount++
    }
  }

  // 7. Get final statistics
  const stats = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number }

  db.close()

  logger.success('Embedding generation complete!')
  logger.info(`Summary: ${newCount} new, ${skipCount} skipped, ${errorCount} errors.`)
  logger.info(`Total embeddings in database: ${stats.count}`)
}

main().catch(err => {
  logger.error('Fatal error:', err)
  process.exit(1)
})
