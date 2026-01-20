import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { loadMoviesDatabase } from '../server/utils/movieData'
import { movieToMarkdown } from '../server/utils/movieEmbeddings'
import { createLogger } from '../server/utils/logger'
import {
  generatePotionEmbedding,
  initPotionPipeline,
  POTION_EMBEDDING_DIM,
} from './utils/potionEmbeddings'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('Potion-Embeddings')
const EMBEDDINGS_DB = join(process.cwd(), 'data/embeddings-potion-movies.db')

async function main() {
  logger.info('Starting potion-base-2M embedding generation...')
  logger.info(`Embedding dimension: ${POTION_EMBEDDING_DIM}`)

  // 1. Ensure data directory exists
  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }

  // 2. Initialize the embedding pipeline
  logger.info('Loading potion-base-2M model...')
  await initPotionPipeline()
  logger.success('Model loaded successfully!')

  // 3. Initialize or open SQLite database
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

  // 4. Load existing embeddings from database for caching
  const existingEmbeddings = db.prepare('SELECT movie_id FROM embeddings').all() as {
    movie_id: string
  }[]
  const embeddingsCache = new Set(existingEmbeddings.map(e => e.movie_id))
  logger.info(`Loaded ${embeddingsCache.size} existing embeddings from database.`)

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

  const startTime = Date.now()

  for (let i = 0; i < movies.length; i++) {
    if (limit > 0 && newCount >= limit) break

    const movie = movies[i]!

    // Skip if already in cache
    if (embeddingsCache.has(movie.movieId)) {
      skipCount++
      continue
    }

    try {
      const markdown = movieToMarkdown(movie)

      // Print markdown input for debugging (first few only)
      if (newCount < 3) {
        logger.info(`\n--- Movie: ${movie.movieId} ---`)
        logger.info('Markdown input:')
        console.log(markdown.slice(0, 200) + '...')
      }

      const embedding = await generatePotionEmbedding(markdown)

      // Print embedding info for debugging (first few only)
      if (newCount < 3) {
        logger.info(`Embedding (${embedding.length} dimensions):`)
        console.log(
          `[${embedding
            .slice(0, 5)
            .map(v => v.toFixed(4))
            .join(', ')}... (${embedding.length} total)]`
        )
      }

      // Store as BLOB (64 floats * 4 bytes = 256 bytes per embedding)
      const buffer = Buffer.from(embedding.buffer)
      const now = new Date().toISOString()

      insert.run(movie.movieId, buffer, now)
      embeddingsCache.add(movie.movieId)
      newCount++

      if (newCount % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = newCount / elapsed
        logger.info(
          `Generated ${newCount} new embeddings... (${i + 1}/${movies.length}) - ${rate.toFixed(1)} emb/s`
        )
      }
    } catch (err) {
      logger.error(`Failed to generate embedding for ${movie.movieId}:`, err)
      errorCount++
    }
  }

  // 7. Get final statistics
  const stats = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number }
  const elapsed = (Date.now() - startTime) / 1000

  db.close()

  logger.success('Embedding generation complete!')
  logger.info(`Summary: ${newCount} new, ${skipCount} skipped, ${errorCount} errors.`)
  logger.info(`Total embeddings in database: ${stats.count}`)
  logger.info(
    `Time elapsed: ${elapsed.toFixed(1)}s (${(newCount / elapsed).toFixed(1)} embeddings/s)`
  )
}

main().catch(err => {
  logger.error('Fatal error:', err)
  process.exit(1)
})
