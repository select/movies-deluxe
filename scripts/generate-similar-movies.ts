/**
 * Generate Similar Movies Database
 *
 * Precalculates movie-to-movie similarity using vector embeddings (KNN search)
 * and stores results in a lightweight lookup database (data/similar-movies.db).
 *
 * This is an expensive operation (~19 min for bge-micro 384d, ~2 min for potion 64d)
 * and should be run locally whenever embeddings are updated.
 *
 * The generated DB is committed to the repo and read during `pnpm db:generate`.
 *
 * Usage:
 *   pnpm similar:generate                    # Use default (bge-micro)
 *   pnpm similar:generate --model=potion     # Use potion (64d, faster)
 *   pnpm similar:generate --model=bge-micro  # Use bge-micro (384d, better quality)
 *   pnpm similar:generate --limit=15         # Store top 15 similar (default: 10)
 */

import { parseArgs } from 'node:util'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'bge-micro' },
    limit: { type: 'string', default: '10' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: pnpm similar:generate [options]

Options:
  --model=<id>   Embedding model to use (default: bge-micro)
                 Available: bge-micro (384d), potion (64d)
  --limit=<n>    Number of similar movies to store per movie (default: 10)
  -h, --help     Show this help message

Output:
  data/similar-movies.db - SQLite DB with precomputed similarities

This DB is read by generateMovieJSON during build to embed similar movies
into each movie's JSON file without running expensive vector search.
  `)
  process.exit(0)
}

const modelId = (values.model as string) || 'bge-micro'
const limit = parseInt((values.limit as string) || '10', 10)

const EMBEDDINGS_DB_PATH = join(process.cwd(), `public/data/embeddings-${modelId}-movies.db`)
const OUTPUT_DB_PATH = join(process.cwd(), 'data/similar-movies.db')

async function main() {
  console.log(`\n🔍 Generating similar movies database`)
  console.log(`   Model: ${modelId}`)
  console.log(`   Limit: ${limit} similar movies per movie`)
  console.log(`   Source: ${EMBEDDINGS_DB_PATH}`)
  console.log(`   Output: ${OUTPUT_DB_PATH}\n`)

  // Validate embeddings DB exists
  if (!existsSync(EMBEDDINGS_DB_PATH)) {
    console.error(`❌ Embeddings database not found: ${EMBEDDINGS_DB_PATH}`)
    console.error(`   Run 'pnpm embeddings:generate-${modelId}' first.`)
    process.exit(1)
  }

  // Open embeddings DB with sqlite-vec
  const vecDb = new Database(EMBEDDINGS_DB_PATH, { readonly: true })
  sqliteVec.load(vecDb)

  // Get all movie IDs with embeddings
  const embeddingRows = vecDb
    .prepare('SELECT id FROM vec_movies_rowids ORDER BY id')
    .all() as Array<{ id: string }>

  console.log(`📊 Found ${embeddingRows.length} movies with embeddings`)

  // Prepare KNN statements
  const getEmbeddingStmt = vecDb.prepare('SELECT embedding FROM vec_movies WHERE movieId = ?')
  // Request more than limit to account for filtering self
  const findSimilarStmt = vecDb.prepare(`
    SELECT v.movieId, v.distance
    FROM vec_movies v
    WHERE v.embedding MATCH ?
      AND k = ?
    ORDER BY v.distance ASC
  `)

  // Remove existing output DB
  if (existsSync(OUTPUT_DB_PATH)) {
    unlinkSync(OUTPUT_DB_PATH)
  }

  // Create output DB
  const outDb = new Database(OUTPUT_DB_PATH)
  outDb.pragma('journal_mode = DELETE')

  outDb.exec(`
    CREATE TABLE similar_movies (
      movieId TEXT NOT NULL,
      similarMovieId TEXT NOT NULL,
      distance REAL NOT NULL,
      rank INTEGER NOT NULL,
      PRIMARY KEY (movieId, rank)
    );

    CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX idx_similar_movieId ON similar_movies(movieId);
  `)

  const insertSimilar = outDb.prepare(`
    INSERT INTO similar_movies (movieId, similarMovieId, distance, rank)
    VALUES (?, ?, ?, ?)
  `)

  const insertConfig = outDb.prepare('INSERT INTO config (key, value) VALUES (?, ?)')

  // Process in transaction for performance
  const startTime = Date.now()
  let processedCount = 0
  let totalSimilarities = 0

  outDb.exec('BEGIN TRANSACTION')

  try {
    for (const row of embeddingRows) {
      const movieId = row.id

      const embRow = getEmbeddingStmt.get(movieId) as { embedding: Buffer } | undefined
      if (!embRow) continue

      const results = findSimilarStmt.all(embRow.embedding, limit + 1) as Array<{
        movieId: string
        distance: number
      }>

      // Filter out self, keep top N
      const similar = results.filter(r => r.movieId !== movieId).slice(0, limit)

      for (let i = 0; i < similar.length; i++) {
        insertSimilar.run(
          movieId,
          similar[i].movieId,
          Math.round(similar[i].distance * 10000) / 10000,
          i + 1
        )
        totalSimilarities++
      }

      processedCount++
      if (processedCount % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = processedCount / elapsed
        const remaining = (embeddingRows.length - processedCount) / rate
        console.log(
          `   ⏳ ${processedCount}/${embeddingRows.length} movies ` +
            `(${Math.round(rate)} movies/sec, ~${Math.round(remaining)}s remaining)`
        )
      }
    }

    // Store metadata
    insertConfig.run('model_id', modelId)
    insertConfig.run('limit', String(limit))
    insertConfig.run('movie_count', String(processedCount))
    insertConfig.run('generated_at', new Date().toISOString())

    outDb.exec('COMMIT')
  } catch (err) {
    outDb.exec('ROLLBACK')
    throw err
  }

  // Optimize
  outDb.exec('ANALYZE')
  outDb.exec('VACUUM')

  outDb.close()
  vecDb.close()

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n✅ Done in ${elapsed}s`)
  console.log(`   Processed: ${processedCount} movies`)
  console.log(`   Similarities: ${totalSimilarities} entries`)
  console.log(`   Output: ${OUTPUT_DB_PATH}`)

  // Show file size
  const { statSync } = await import('fs')
  const stats = statSync(OUTPUT_DB_PATH)
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB\n`)
}

main().catch(err => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
