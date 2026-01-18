/**
 * Vector Search Benchmark Script
 *
 * Measures performance and accuracy of vector search vs keyword search.
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { join } from 'path'
import { performance } from 'perf_hooks'

const DB_PATH = join(process.cwd(), 'public/data/movies.db')

async function runBenchmark() {
  console.log('--- Vector Search Benchmark ---')
  console.log(`Database: ${DB_PATH}`)

  const db = new Database(DB_PATH)
  sqliteVec.load(db)

  // 1. Warm up
  db.prepare('SELECT count(*) FROM vec_movies').get()

  // 2. Benchmark Similarity Search (Movie-to-Movie)
  // We pick 5 random movies that have embeddings
  const testMovies = db
    .prepare(
      `
    SELECT m.movieId, m.title 
    FROM movies m 
    JOIN vec_movies v ON m.movieId = v.movieId 
    ORDER BY RANDOM() LIMIT 5
  `
    )
    .all() as { movieId: string; title: string }[]

  if (testMovies.length === 0) {
    console.log('No movies with embeddings found in vec_movies table.')
    db.close()
    return
  }

  console.log('\n--- Similarity Search (KNN) ---')
  for (const movie of testMovies) {
    const embeddingRow = db
      .prepare('SELECT embedding FROM vec_movies WHERE movieId = ?')
      .get(movie.movieId) as { embedding: Buffer }
    if (!embeddingRow) continue

    const start = performance.now()
    const results = db
      .prepare(
        `
      SELECT m.title, v.distance
      FROM vec_movies v
      JOIN movies m ON v.movieId = m.movieId
      WHERE v.embedding MATCH ?
        AND k = 11
      ORDER BY v.distance ASC
    `
      )
      .all(embeddingRow.embedding) as { title: string; distance: number }[]
    const end = performance.now()

    console.log(`\nMovie: "${movie.title}" (${movie.movieId})`)
    console.log(`Latency: ${(end - start).toFixed(2)}ms`)
    console.log('Top 5 similar:')
    results.slice(1, 6).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} (dist: ${r.distance.toFixed(4)})`)
    })
  }

  // 3. Benchmark Keyword Search (FTS5)
  console.log('\n--- Keyword Search (FTS5) ---')
  const keywords = ['Space', 'Love', 'War', 'Crime', 'Time']
  for (const keyword of keywords) {
    const start = performance.now()
    const results = db
      .prepare(
        `
      SELECT title
      FROM fts_movies
      WHERE title MATCH ?
      LIMIT 10
    `
      )
      .all(keyword) as { title: string }[]
    const end = performance.now()

    console.log(`\nKeyword: "${keyword}"`)
    console.log(`Latency: ${(end - start).toFixed(2)}ms`)
    console.log(`Found ${results.length} results`)
  }

  // 4. Hybrid Search Simulation (RRF)
  console.log('\n--- Hybrid Search Simulation (RRF) ---')
  const queryMovie = testMovies[0]
  const queryEmbedding = db
    .prepare('SELECT embedding FROM vec_movies WHERE movieId = ?')
    .get(queryMovie.movieId) as { embedding: Buffer }

  const startHybrid = performance.now()

  // Get Vector results
  const vecResults = db
    .prepare(
      `
    SELECT movieId FROM vec_movies WHERE embedding MATCH ? AND k = 50
  `
    )
    .all(queryEmbedding.embedding) as { movieId: string }[]

  // Get FTS results (using first word of title)
  const firstWord = queryMovie.title.split(' ')[0]
  const ftsResults = db
    .prepare(
      `
    SELECT movieId FROM fts_movies WHERE title MATCH ? LIMIT 50
  `
    )
    .all(firstWord) as { movieId: string }[]

  // RRF implementation
  const k_rrf = 60
  const scores = new Map<string, number>()

  vecResults.forEach((r, i) => {
    scores.set(r.movieId, (scores.get(r.movieId) || 0) + 1 / (k_rrf + i + 1))
  })

  ftsResults.forEach((r, i) => {
    scores.set(r.movieId, (scores.get(r.movieId) || 0) + 1 / (k_rrf + i + 1))
  })

  const hybridResults = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const endHybrid = performance.now()

  console.log(`\nHybrid Query (based on "${queryMovie.title}")`)
  console.log(`Latency: ${(endHybrid - startHybrid).toFixed(2)}ms`)
  console.log('Top 5 results:')
  hybridResults.slice(0, 5).forEach((r, i) => {
    const titleRow = db.prepare('SELECT title FROM movies WHERE movieId = ?').get(r[0]) as {
      title: string
    }
    console.log(`  ${i + 1}. ${titleRow?.title || r[0]} (score: ${r[1].toFixed(6)})`)
  })

  db.close()
}

runBenchmark().catch(console.error)
