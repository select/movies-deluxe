import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { loadMoviesDatabase } from '../server/utils/movieData'
import { movieToMarkdown } from '../server/utils/movieEmbeddings'
import { createLogger } from '../server/utils/logger'
import { getModelConfig } from '../config/embedding-models'
import {
  generateBgeMicroEmbedding,
  initBgeMicroPipeline,
  BGE_MICRO_EMBEDDING_DIM,
} from './utils/bgeMicroEmbeddings'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('BGE-Embeddings')
const MODEL_ID = 'bge-micro'
const modelConfig = getModelConfig(MODEL_ID)

if (!modelConfig) {
  logger.error(`Model configuration for "${MODEL_ID}" not found.`)
  process.exit(1)
}

const EMBEDDINGS_DB = join(process.cwd(), 'data', modelConfig.dbFileName)

async function main() {
  logger.info(`Starting ${modelConfig.name} embedding generation...`)
  logger.info(`Embedding dimension: ${BGE_MICRO_EMBEDDING_DIM}`)

  // 1. Ensure data directory exists
  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }

  // 2. Initialize the embedding pipeline
  logger.info(`Loading ${modelConfig.name} model...`)
  await initBgeMicroPipeline()
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

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)

    // Insert model metadata
    const insertConfig = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)')
    insertConfig.run('embedding_model_id', modelConfig.id)
    insertConfig.run('embedding_model_name', modelConfig.name)
    insertConfig.run('embedding_model_dimensions', modelConfig.dimensions.toString())
    if (modelConfig.ollamaModel) {
      insertConfig.run('embedding_model_ollama', modelConfig.ollamaModel)
    }
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
        console.log(markdown)
      }

      const embedding = await generateBgeMicroEmbedding(markdown)

      // Print embedding info for debugging (first few only)
      if (newCount < 3) {
        logger.info(`Embedding (${embedding.length} dimensions):`)
        console.log(`[${embedding.slice(0, 5).join(', ')}... (${embedding.length} total)]`)
      }

      // Store as BLOB
      const buffer = Buffer.from(embedding.buffer)
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
