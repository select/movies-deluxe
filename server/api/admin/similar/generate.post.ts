/**
 * Similar Movies Generation API Endpoint
 *
 * Generates the precomputed similar-movies.db from vector embeddings.
 * This runs KNN search for all movies and stores results in a lookup table.
 *
 * Should be triggered after embeddings are generated/updated.
 */

import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

interface GenerateSimilarRequest {
  model?: string // Embedding model to use (default: bge-micro)
  limit?: number // Number of similar movies per movie (default: 10)
}

export default defineEventHandler(async event => {
  // Only allow from localhost
  const host = getRequestHeader(event, 'host')
  if (!host?.startsWith('localhost') && !host?.startsWith('127.0.0.1')) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const body = await readBody<GenerateSimilarRequest>(event)
  const modelId = body?.model || 'bge-micro'
  const limit = body?.limit || 10

  const embeddingsDbPath = join(process.cwd(), `public/data/embeddings-${modelId}-movies.db`)
  const outputDbPath = join(process.cwd(), 'data/similar-movies.db')

  if (!existsSync(embeddingsDbPath)) {
    throw createError({
      statusCode: 400,
      message: `Embeddings database not found: embeddings-${modelId}-movies.db`,
    })
  }

  try {
    emitProgress({
      type: 'similar',
      status: 'starting',
      message: `Generating similar movies from ${modelId} embeddings...`,
      current: 0,
      total: 100,
    })

    // Open embeddings DB with sqlite-vec
    const vecDb = new Database(embeddingsDbPath, { readonly: true })
    sqliteVec.load(vecDb)

    // Get all movie IDs with embeddings
    const embeddingRows = vecDb
      .prepare('SELECT id FROM vec_movies_rowids ORDER BY id')
      .all() as Array<{ id: string }>

    const totalMovies = embeddingRows.length

    console.log(
      `[Similar] Starting generation: ${totalMovies} movies, model=${modelId}, limit=${limit}`
    )

    emitProgress({
      type: 'similar',
      status: 'in_progress',
      message: `Found ${totalMovies} movies with embeddings`,
      current: 0,
      total: totalMovies,
    })

    // Prepare KNN statements
    const getEmbeddingStmt = vecDb.prepare('SELECT embedding FROM vec_movies WHERE movieId = ?')
    const findSimilarStmt = vecDb.prepare(`
      SELECT v.movieId, v.distance
      FROM vec_movies v
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance ASC
    `)

    // Remove existing output DB
    if (existsSync(outputDbPath)) {
      unlinkSync(outputDbPath)
    }

    // Create output DB
    const outDb = new Database(outputDbPath)
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

    // Process in transaction
    outDb.exec('BEGIN TRANSACTION')

    let processedCount = 0
    const startTime = Date.now()

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
        const s = similar[i]!
        insertSimilar.run(movieId, s.movieId, Math.round(s.distance * 10000) / 10000, i + 1)
      }

      processedCount++
      if (processedCount % 500 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = Math.round(processedCount / elapsed)
        const remaining = Math.round((totalMovies - processedCount) / rate)
        const msg = `Processing ${processedCount}/${totalMovies} (${rate}/s, ~${remaining}s left)`
        console.log(`[Similar] ${msg}`)
        emitProgress({
          type: 'similar',
          status: 'in_progress',
          message: msg,
          current: processedCount,
          total: totalMovies,
        })
        // Yield event loop so SSE progress events can flush to client
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    // Store metadata
    insertConfig.run('model_id', modelId)
    insertConfig.run('limit', String(limit))
    insertConfig.run('movie_count', String(processedCount))
    insertConfig.run('generated_at', new Date().toISOString())

    outDb.exec('COMMIT')
    outDb.exec('ANALYZE')
    outDb.exec('VACUUM')

    outDb.close()
    vecDb.close()

    console.log(`[Similar] Completed: ${processedCount} movies processed`)

    emitProgress({
      type: 'similar',
      status: 'completed',
      message: `Generated similar movies for ${processedCount} movies`,
      current: totalMovies,
      total: totalMovies,
    })

    return {
      success: true,
      message: `Generated similar movies for ${processedCount} movies using ${modelId}`,
      movieCount: processedCount,
    }
  } catch (error: unknown) {
    console.error('Similar movies generation failed:', error)

    emitProgress({
      type: 'similar',
      status: 'error',
      message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      current: 0,
      total: 100,
    })

    return {
      success: false,
      message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
})
