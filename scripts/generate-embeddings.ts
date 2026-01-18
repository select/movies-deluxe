import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import ollama from 'ollama'
import { loadMoviesDatabase } from '../server/utils/movieData'
import { movieToMarkdown } from '../server/utils/movieEmbeddings'
import { createLogger } from '../server/utils/logger'
import type { MovieEntry } from '../shared/types/movie'

const logger = createLogger('Embeddings')
const EMBEDDINGS_FILE = join(process.cwd(), 'data/embeddings.json')
const MODEL = 'nomic-embed-text'

async function main() {
  logger.info('Starting embedding generation...')

  // 1. Ensure data directory exists
  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }

  // 2. Load existing embeddings for caching
  let embeddingsCache: Record<string, number[]> = {}
  if (existsSync(EMBEDDINGS_FILE)) {
    try {
      const content = await readFile(EMBEDDINGS_FILE, 'utf-8')
      embeddingsCache = JSON.parse(content)
      logger.info(`Loaded ${Object.keys(embeddingsCache).length} existing embeddings from cache.`)
    } catch {
      logger.warn('Failed to load existing embeddings, starting fresh.')
    }
  }

  // 3. Load movies
  const db = await loadMoviesDatabase()
  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry =>
      typeof entry === 'object' && entry !== null && 'movieId' in entry
  )

  const limit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '0')
    : 0

  logger.info(`Processing ${movies.length} movies...`)
  if (limit > 0) logger.info(`Limit set to ${limit} movies.`)

  let newCount = 0
  let skipCount = 0
  let errorCount = 0

  for (let i = 0; i < movies.length; i++) {
    if (limit > 0 && newCount >= limit) break

    const movie = movies[i]!

    // Skip if already in cache
    if (embeddingsCache[movie.movieId]) {
      skipCount++
      continue
    }

    try {
      const text = movieToMarkdown(movie)
      const response = await ollama.embeddings({
        model: MODEL,
        prompt: text,
      })

      embeddingsCache[movie.movieId] = response.embedding
      newCount++

      if (newCount % 10 === 0) {
        logger.info(`Generated ${newCount} new embeddings... (${i + 1}/${movies.length})`)
        // Periodic save to avoid losing progress
        await writeFile(EMBEDDINGS_FILE, JSON.stringify(embeddingsCache))
      }
    } catch (err) {
      logger.error(`Failed to generate embedding for ${movie.movieId}:`, err)
      errorCount++
    }
  }

  // 4. Final save
  await writeFile(EMBEDDINGS_FILE, JSON.stringify(embeddingsCache))

  logger.success('Embedding generation complete!')
  logger.info(`Summary: ${newCount} new, ${skipCount} skipped, ${errorCount} errors.`)
  logger.info(`Total embeddings: ${Object.keys(embeddingsCache).length}`)
}

main().catch(err => {
  logger.error('Fatal error:', err)
  process.exit(1)
})
