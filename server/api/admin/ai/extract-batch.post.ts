import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// Note: The following functions are auto-imported from server/utils/:
// - loadFailedAIExtractions, saveFailedAIExtraction, clearFailedAIExtractions, removeFailedAIExtraction, hasFailedAIExtraction (from failedAI.ts)
// - emitProgress (from progress.ts)
// - extractMovieMetadata, extractMovieMetadataBatch (from ollama.ts)
// - extractMovieMetadataOpenRouter, extractMovieMetadataBatchOpenRouter (from openrouter.ts)

interface BatchOptions {
  provider?: 'ollama' | 'openrouter'
  model?: string
  limit?: number
  batchSize?: number
  onlyUnmatched?: boolean
  forceReExtract?: boolean
  forceRetryFailed?: boolean
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
      // Check if Ollama is reachable
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
    const filePath = join(process.cwd(), 'data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    const db = JSON.parse(content)

    if (forceRetryFailed) {
      clearFailedAIExtractions()
    }

    // Load failed extractions to skip them
    const failedExtractions = loadFailedAIExtractions()

    // Get movies to process
    const movies = Object.entries(db as MoviesDatabase)
      .filter(([id, movie]: [string, MovieEntry | unknown]) => {
        if (id.startsWith('_')) return false
        const movieEntry = movie as MovieEntry

        // Skip if already has AI data and not forcing re-extraction
        if (!forceReExtract && movieEntry.ai?.title) return false

        // Skip if only processing unmatched and this has metadata
        if (onlyUnmatched && movieEntry.metadata) return false

        // Skip if this entry has failed before (unless forcing retry)
        if (!forceRetryFailed && failedExtractions.has(id)) return false

        return true
      })
      .slice(0, limit)

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

      // Prepare batch input
      const batchInput = batch.map(([id, movie]) => {
        const movieEntry = movie as MovieEntry
        const source = movieEntry.sources[0]
        return {
          id,
          title: source?.title || movieEntry.title,
          description: source?.description || '',
        }
      })

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
        // Call the appropriate batch extraction function based on provider
        const extractedMap =
          provider === 'openrouter'
            ? await extractMovieMetadataBatchOpenRouter(batchInput, { model })
            : await extractMovieMetadataBatch(batchInput, { model })

        console.log(`[AI Extraction] Batch ${batchNumber} returned ${extractedMap.size} results`)

        // Process results for each movie in the batch
        for (const [id, movie] of batch) {
          current++
          const movieEntry = movie as MovieEntry
          const source = movieEntry.sources[0]
          const title = source?.title || movieEntry.title
          const description = source?.description || ''

          const extracted = extractedMap.get(id)

          if (extracted?.title) {
            movieEntry.ai = extracted
            successCount++
            console.log(
              `[AI Extraction]   + ${id}: "${extracted.title}"${extracted.year ? ` (${extracted.year})` : ''}`
            )

            // Remove from failed list if it was there (successful retry)
            removeFailedAIExtraction(id)
          } else {
            failedCount++
            console.log(
              `[AI Extraction]   - ${id}: No result (source: "${title.substring(0, 50)}...")`
            )

            // Track the failed extraction attempt
            saveFailedAIExtraction(
              id,
              title,
              'AI extraction returned no result for this item in batch',
              {
                title,
                description,
                timestamp: new Date().toISOString(),
              },
              source
                ? {
                    type: source.type || 'unknown',
                    hasDescription: Boolean(description),
                    titleLength: title.length,
                    descriptionLength: description.length,
                  }
                : undefined
            )
          }

          // Emit progress for each movie processed
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

        // Save after each batch to prevent data loss
        await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')
      } catch (error) {
        // Batch failed entirely - mark all items in batch as failed
        console.error(`Batch ${batchNumber} failed:`, error)

        for (const [id, movie] of batch) {
          current++
          failedCount++

          const movieEntry = movie as MovieEntry
          const source = movieEntry.sources[0]
          const title = source?.title || movieEntry.title
          const description = source?.description || ''

          saveFailedAIExtraction(
            id,
            title,
            `Batch extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            {
              title,
              description,
              timestamp: new Date().toISOString(),
            },
            source
              ? {
                  type: source.type || 'unknown',
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

    // Final save
    db._schema.lastUpdated = new Date().toISOString()
    await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')

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
