import { defineEventHandler, readBody, createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getAdminDatabase } from '#server/utils/adminDb'
import {
  clearFailedAIExtractions,
  loadFailedAIExtractions,
  removeFailedAIExtraction,
  saveFailedAIExtraction,
} from '#server/utils/failedAI'
import { emitProgress } from '#server/utils/progress'
import { extractMovieMetadataBatchOpenRouter } from '#server/utils/openrouter'
import { extractMovieMetadataBatch } from '#server/utils/ollama'

interface BatchOptions {
  provider?: 'ollama' | 'openrouter'
  model?: string
  limit?: number
  batchSize?: number
  onlyUnmatched?: boolean
  forceReExtract?: boolean
  forceRetryFailed?: boolean
}

interface CandidateMovieRow {
  movieId: string
  movieTitle: string
  sourceTitle: string | null
  sourceDescription: string | null
  sourceType: string | null
}

export default defineEventHandler(async event => {
  const body = await readBody<BatchOptions>(event)
  const {
    provider = 'ollama',
    model,
    limit = 100,
    batchSize = 5,
    onlyUnmatched = true,
    forceReExtract = false,
    forceRetryFailed = false,
  } = body

  // Validate provider
  if (provider !== 'ollama' && provider !== 'openrouter') {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid provider: ${provider}. Must be 'ollama' or 'openrouter'.`,
    })
  }

  // Get runtime config for provider validation
  const config = useRuntimeConfig()

  // Validate provider configuration
  if (provider === 'openrouter') {
    if (!config.openrouterApiKey) {
      throw createError({
        statusCode: 400,
        statusMessage:
          'OpenRouter is not configured. Please set OPENROUTER_API_KEY environment variable.',
      })
    }
  }

  if (provider === 'ollama') {
    const ollamaHost = config.ollamaHost
    try {
      const response = await fetch(`${ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) {
        throw createError({
          statusCode: 503,
          statusMessage: `Ollama service is not responding correctly at ${ollamaHost}. Status: ${response.status}`,
        })
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error
      }
      throw createError({
        statusCode: 503,
        statusMessage: `Cannot reach Ollama service at ${ollamaHost}. Please ensure Ollama is running.`,
      })
    }
  }

  try {
    const db = getAdminDatabase()

    if (forceRetryFailed) {
      clearFailedAIExtractions()
    }

    // Load failed extractions to skip them
    const failedExtractions = loadFailedAIExtractions()

    // Query candidate movies directly from SQLite (data/movies.db)
    const whereClauses: string[] = []
    if (!forceReExtract) {
      whereClauses.push("(ai.title IS NULL OR ai.title = '')")
    }
    if (onlyUnmatched) {
      whereClauses.push('meta.movieId IS NULL')
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const rows = db
      .prepare(
        `
        SELECT
          m.movieId,
          m.title AS movieTitle,
          (
            SELECT s.title
            FROM sources s
            WHERE s.movieId = m.movieId
            ORDER BY s.addedAt ASC
            LIMIT 1
          ) AS sourceTitle,
          (
            SELECT s.description
            FROM sources s
            WHERE s.movieId = m.movieId
            ORDER BY s.addedAt ASC
            LIMIT 1
          ) AS sourceDescription,
          (
            SELECT c.platform
            FROM sources s
            JOIN channels c ON s.channelId = c.id
            WHERE s.movieId = m.movieId
            ORDER BY s.addedAt ASC
            LIMIT 1
          ) AS sourceType
        FROM movies m
        LEFT JOIN ai_metadata ai ON m.movieId = ai.movieId
        LEFT JOIN metadata meta ON m.movieId = meta.movieId
        ${whereSql}
      `
      )
      .all() as CandidateMovieRow[]

    const movies = rows
      .filter(row => forceRetryFailed || !failedExtractions.has(row.movieId))
      .slice(0, limit)

    const upsertAiStmt = db.prepare(`
      INSERT INTO ai_metadata (movieId, title, year, extractedAt)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(movieId) DO UPDATE SET
        title = excluded.title,
        year = excluded.year,
        extractedAt = datetime('now')
    `)

    const saveBatchResults = db.transaction(
      (entries: Array<{ movieId: string; title: string; year?: number }>) => {
        for (const entry of entries) {
          upsertAiStmt.run(entry.movieId, entry.title, entry.year ?? null)
        }
      }
    )

    const total = movies.length
    let current = 0
    let successCount = 0
    let failedCount = 0

    console.log(
      `[AI Extraction] Starting batch extraction: ${total} movies, batch size: ${batchSize}, provider: ${provider}, model: ${model || 'default'}`
    )

    emitProgress({
      type: 'ai',
      status: 'starting',
      message: `Starting AI extraction (batch size: ${batchSize})...`,
      current: 0,
      total,
      successCurrent: 0,
      failedCurrent: 0,
    })

    // Process movies in batches
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(movies.length / batchSize)

      const batchInput = batch.map(row => ({
        id: row.movieId,
        title: row.sourceTitle || row.movieTitle,
        description: row.sourceDescription || '',
      }))

      console.log(
        `[AI Extraction] Processing batch ${batchNumber}/${totalBatches} (${batch.length} movies)`
      )

      emitProgress({
        type: 'ai',
        status: 'in_progress',
        message: `Processing batch ${batchNumber}/${totalBatches} (${batch.length} movies)...`,
        current,
        total,
        successCurrent: successCount,
        failedCurrent: failedCount,
      })

      try {
        const extractedMap =
          provider === 'openrouter'
            ? await extractMovieMetadataBatchOpenRouter(batchInput, { model })
            : await extractMovieMetadataBatch(batchInput, { model })

        console.log(`[AI Extraction] Batch ${batchNumber} returned ${extractedMap.size} results`)

        const toPersist: Array<{ movieId: string; title: string; year?: number }> = []

        for (const row of batch) {
          current++
          const id = row.movieId
          const title = row.sourceTitle || row.movieTitle
          const description = row.sourceDescription || ''

          const extracted = extractedMap.get(id)

          if (extracted?.title) {
            toPersist.push({
              movieId: id,
              title: extracted.title,
              year: extracted.year,
            })
            successCount++
            console.log(
              `[AI Extraction]   + ${id}: "${extracted.title}"${extracted.year ? ` (${extracted.year})` : ''}`
            )

            removeFailedAIExtraction(id)
          } else {
            failedCount++
            console.log(
              `[AI Extraction]   - ${id}: No result (source: "${title.substring(0, 50)}...")`
            )

            saveFailedAIExtraction(
              id,
              title,
              'AI extraction returned no result for this item in batch',
              {
                title,
                description,
                timestamp: new Date().toISOString(),
              },
              row.sourceType
                ? {
                    type: row.sourceType,
                    hasDescription: Boolean(description),
                    titleLength: title.length,
                    descriptionLength: description.length,
                  }
                : undefined
            )
          }

          emitProgress({
            type: 'ai',
            status: 'in_progress',
            message: extracted?.title
              ? `Extracted: ${extracted.title}${extracted.year ? ` (${extracted.year})` : ''}`
              : `Failed: ${title.substring(0, 40)}...`,
            current,
            total,
            successCurrent: successCount,
            failedCurrent: failedCount,
          })
        }

        // Persist batch results to SQLite after each batch
        if (toPersist.length > 0) {
          saveBatchResults(toPersist)
        }
      } catch (error) {
        console.error(`Batch ${batchNumber} failed:`, error)

        for (const row of batch) {
          current++
          failedCount++

          const id = row.movieId
          const title = row.sourceTitle || row.movieTitle
          const description = row.sourceDescription || ''

          saveFailedAIExtraction(
            id,
            title,
            `Batch extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            {
              title,
              description,
              timestamp: new Date().toISOString(),
            },
            row.sourceType
              ? {
                  type: row.sourceType,
                  hasDescription: Boolean(description),
                  titleLength: title.length,
                  descriptionLength: description.length,
                }
              : undefined
          )
        }
      }

      emitProgress({
        type: 'ai',
        status: 'in_progress',
        message: `Completed batch ${batchNumber}/${totalBatches}`,
        current,
        total,
        successCurrent: successCount,
        failedCurrent: failedCount,
      })

      console.log(
        `[AI Extraction] Batch ${batchNumber}/${totalBatches} complete: ${successCount} success, ${failedCount} failed (total: ${current}/${total})`
      )
    }

    emitProgress({
      type: 'ai',
      status: 'completed',
      message: `Completed: ${successCount} successful, ${failedCount} failed`,
      current: total,
      total,
      successCurrent: successCount,
      failedCurrent: failedCount,
    })

    console.log(
      `[AI Extraction] Completed: ${successCount} successful, ${failedCount} failed out of ${total} movies`
    )

    return {
      success: true,
      processed: total,
      successful: successCount,
      failed: failedCount,
    }
  } catch (error) {
    emitProgress({
      type: 'ai',
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      current: 0,
      total: 0,
    })

    throw createError({
      statusCode: 500,
      statusMessage: `Batch AI extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
