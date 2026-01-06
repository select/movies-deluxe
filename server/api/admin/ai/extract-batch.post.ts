import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// Note: The following functions are auto-imported from server/utils/:
// - loadFailedAIExtractions, saveFailedAIExtraction, clearFailedAIExtractions, removeFailedAIExtraction, hasFailedAIExtraction (from failedAI.ts)
// - emitProgress (from progress.ts)
// - extractMovieMetadata (from ai.ts)

interface BatchOptions {
  limit?: number
  onlyUnmatched?: boolean
  forceReExtract?: boolean
  forceRetryFailed?: boolean
}

export default defineEventHandler(async event => {
  const body = await readBody<BatchOptions>(event)
  const {
    limit = 100,
    onlyUnmatched = true,
    forceReExtract = false,
    forceRetryFailed = false,
  } = body

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
    const movies = Object.entries(db)
      .filter(([id, movie]: [string, unknown]) => {
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

    emitProgress({
      type: 'ai',
      status: 'starting',
      message: 'Starting AI extraction...',
      current: 0,
      total,
      successCurrent: 0,
      failedCurrent: 0,
    })

    for (const [id, movie] of movies) {
      current++

      try {
        // Get first source for extraction
        const source = (movie as MovieEntry).sources[0]
        if (!source) {
          failedCount++
          saveFailedAIExtraction(
            id,
            (movie as MovieEntry).title as string,
            'No source available for extraction'
          )
          continue
        }

        const title = source.title || (movie as MovieEntry).title
        const description = source.description || ''

        emitProgress({
          type: 'ai',
          status: 'in_progress',
          message: `Extracting: ${title.substring(0, 50)}...`,
          current,
          total,
          successCurrent: successCount,
          failedCurrent: failedCount,
        })

        const extracted = await extractMovieMetadata(title, description)

        if (extracted?.title) {
          ;(movie as MovieEntry).ai = extracted
          successCount++

          // Remove from failed list if it was there (successful retry)
          removeFailedAIExtraction(id)

          // Save immediately after each successful extraction to prevent data loss
          await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')
        } else {
          failedCount++

          // Track the failed extraction attempt
          saveFailedAIExtraction(
            id,
            title,
            'AI extraction returned no title',
            {
              title,
              description,
              timestamp: new Date().toISOString(),
            },
            {
              type: source.type,
              hasDescription: Boolean(description),
              titleLength: title.length,
              descriptionLength: description.length,
            }
          )
        }
      } catch (error) {
        console.error(`AI extraction failed for ${id}:`, error)
        failedCount++

        // Track the failed extraction attempt with error details
        const source = (movie as MovieEntry).sources[0]
        const title = source?.title || (movie as MovieEntry).title
        const description = source?.description || ''

        saveFailedAIExtraction(
          id,
          title,
          `Extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            title,
            description,
            timestamp: new Date().toISOString(),
          },
          source
            ? {
                type: source.type,
                hasDescription: Boolean(description),
                titleLength: title.length,
                descriptionLength: description.length,
              }
            : undefined
        )
      }
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
