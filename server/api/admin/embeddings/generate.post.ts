/**
 * Embeddings Generation API Endpoint
 *
 * Generates embeddings for movies using the specified embedding model(s).
 * Supports: nomic (Ollama), bge-micro (local Transformers.js), potion (local ONNX)
 *
 * NOTE: We use dynamic imports for model-specific modules to avoid loading
 * heavy dependencies (like onnxruntime-node) at startup.
 */

import { EMBEDDING_MODELS, getModelConfig } from '../../../../config/embedding-models'
import {
  initEmbeddingsDatabase,
  getExistingEmbeddingIds,
  saveEmbedding,
  getEmbeddingsCount,
} from '../../../utils/embeddings/database'
import type { MovieEntry } from '../../../../shared/types/movie'

interface GenerateEmbeddingsRequest {
  models: string[] // ['nomic', 'bge-micro', 'potion'] or ['all']
  limit?: number
}

interface ModelResult {
  model: string
  processed: number
  skipped: number
  failed: number
  totalInDb: number
  embeddingsPerSecond: number
  timeElapsed: number
}

interface GenerateEmbeddingsResponse {
  success: boolean
  results: ModelResult[]
  errors: string[]
}

// Rolling average for embeddings per second calculation
class RollingAverage {
  private times: number[] = []
  private readonly windowSize: number

  constructor(windowSize: number = 10) {
    this.windowSize = windowSize
  }

  add(timeMs: number): void {
    this.times.push(timeMs)
    if (this.times.length > this.windowSize) {
      this.times.shift()
    }
  }

  getEmbeddingsPerSecond(): number {
    if (this.times.length === 0) return 0
    const avgTimeMs = this.times.reduce((a, b) => a + b, 0) / this.times.length
    return avgTimeMs > 0 ? 1000 / avgTimeMs : 0
  }
}

export default defineEventHandler(async event => {
  const body = await readBody<GenerateEmbeddingsRequest>(event)
  const { models: requestModels = ['nomic'], limit = 0 } = body || {}
  let models = requestModels

  // Handle 'all' option
  if (models.includes('all')) {
    models = EMBEDDING_MODELS.map(m => m.id)
  }

  const results: ModelResult[] = []
  const errors: string[] = []

  // Load movies database once
  const moviesDb = await loadMoviesDatabase()
  const movies = Object.values(moviesDb).filter(
    (entry): entry is MovieEntry =>
      typeof entry === 'object' && entry !== null && 'movieId' in entry
  )

  console.log(`[Embeddings] Found ${movies.length} movies to process`)

  // Process each model
  for (const modelId of models) {
    const modelConfig = getModelConfig(modelId)
    if (!modelConfig) {
      errors.push(`Unknown model: ${modelId}`)
      continue
    }

    console.log(`[Embeddings] Processing model: ${modelConfig.name}`)

    // Dynamically import model-specific modules to avoid loading heavy deps at startup
    let generateEmbedding: (text: string) => Promise<Float32Array>
    let initPipeline: (() => Promise<unknown>) | undefined
    let checkAvailability: () => Promise<{ available: boolean; error?: string }>

    try {
      if (modelId === 'nomic') {
        const nomicModule = await import('../../../utils/embeddings/_nomic')
        checkAvailability = nomicModule.checkNomicAvailability
        generateEmbedding = (text: string) => nomicModule.generateNomicEmbedding(text, modelConfig)
      } else if (modelId === 'bge-micro') {
        const bgeModule = await import('../../../utils/embeddings/_bge')
        checkAvailability = bgeModule.checkBgeAvailability
        initPipeline = bgeModule.initBgeMicroPipeline
        generateEmbedding = bgeModule.generateBgeMicroEmbedding
      } else if (modelId === 'potion') {
        // Potion model uses onnxruntime-node which has compatibility issues with Node 24+
        // Use the CLI script instead: pnpm tsx scripts/generate-embeddings-potion.ts
        errors.push(
          `${modelConfig.name}: Not available in Admin UI. Use CLI: pnpm tsx scripts/generate-embeddings-potion.ts`
        )
        continue
      } else {
        errors.push(`Unknown model type: ${modelId}`)
        continue
      }
    } catch (err) {
      errors.push(
        `Failed to load ${modelConfig.name} module: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
      continue
    }

    // Check model availability
    const availabilityCheck = await checkAvailability()
    if (!availabilityCheck.available) {
      errors.push(`${modelConfig.name}: ${availabilityCheck.error}`)
      continue
    }

    // Initialize model-specific pipelines
    if (initPipeline) {
      try {
        emitProgress({
          type: 'embeddings',
          status: 'starting',
          current: 0,
          total: 0,
          message: `Loading ${modelConfig.name} model...`,
        })
        await initPipeline()
      } catch (err) {
        errors.push(
          `Failed to initialize ${modelConfig.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
        continue
      }
    }

    // Initialize database
    const db = await initEmbeddingsDatabase(modelConfig)
    const existingIds = getExistingEmbeddingIds(db)

    // Filter movies that need embeddings
    const moviesToProcess = movies.filter(m => !existingIds.has(m.movieId))

    // Apply limit if specified
    const processLimit =
      limit > 0 ? Math.min(limit, moviesToProcess.length) : moviesToProcess.length
    const targetMovies = moviesToProcess.slice(0, processLimit)

    console.log(
      `[Embeddings] ${modelConfig.name}: ${targetMovies.length} to process, ${existingIds.size} already exist`
    )

    emitProgress({
      type: 'embeddings',
      status: 'starting',
      current: 0,
      total: targetMovies.length,
      message: `Starting ${modelConfig.name} embedding generation...`,
      successCurrent: 0,
      failedCurrent: 0,
    })

    const result: ModelResult = {
      model: modelId,
      processed: 0,
      skipped: existingIds.size,
      failed: 0,
      totalInDb: 0,
      embeddingsPerSecond: 0,
      timeElapsed: 0,
    }

    const startTime = Date.now()
    const rollingAvg = new RollingAverage(10)

    for (let i = 0; i < targetMovies.length; i++) {
      const movie = targetMovies[i]!
      const embeddingStartTime = Date.now()

      try {
        const text = movieToMarkdown(movie)
        const embedding = await generateEmbedding(text)

        saveEmbedding(db, movie.movieId, embedding)
        result.processed++

        // Calculate timing
        const embeddingTime = Date.now() - embeddingStartTime
        rollingAvg.add(embeddingTime)
        const embeddingsPerSecond = rollingAvg.getEmbeddingsPerSecond()

        // Calculate ETA
        const remaining = targetMovies.length - (i + 1)
        const estimatedTimeRemaining =
          embeddingsPerSecond > 0 ? Math.round(remaining / embeddingsPerSecond) : 0

        // Emit progress
        emitProgress({
          type: 'embeddings',
          status: 'in_progress',
          current: i + 1,
          total: targetMovies.length,
          message: `${modelConfig.name}: ${movie.title || movie.movieId}`,
          successCurrent: result.processed,
          failedCurrent: result.failed,
          embeddingsPerSecond: Math.round(embeddingsPerSecond * 10) / 10,
          estimatedTimeRemaining,
        })
      } catch (err) {
        result.failed++
        console.error(
          `[Embeddings] Failed for ${movie.movieId}:`,
          err instanceof Error ? err.message : err
        )
      }
    }

    result.timeElapsed = (Date.now() - startTime) / 1000
    result.totalInDb = getEmbeddingsCount(db)
    result.embeddingsPerSecond =
      result.timeElapsed > 0 ? Math.round((result.processed / result.timeElapsed) * 10) / 10 : 0

    db.close()
    results.push(result)

    console.log(
      `[Embeddings] ${modelConfig.name} complete: ${result.processed} processed, ${result.failed} failed, ${result.totalInDb} total in DB`
    )
  }

  // Final progress update
  emitProgress({
    type: 'embeddings',
    status: 'completed',
    current: results.reduce((sum, r) => sum + r.processed, 0),
    total: results.reduce((sum, r) => sum + r.processed + r.failed, 0),
    message: `Completed: ${results.map(r => `${r.model}: ${r.processed}`).join(', ')}`,
    successCurrent: results.reduce((sum, r) => sum + r.processed, 0),
    failedCurrent: results.reduce((sum, r) => sum + r.failed, 0),
  })

  return {
    success: errors.length === 0,
    results,
    errors,
  } as GenerateEmbeddingsResponse
})
