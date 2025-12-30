import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

interface BatchOptions {
  limit?: number
  onlyUnmatched?: boolean
  forceReExtract?: boolean
}

export default defineEventHandler(async event => {
  const body = await readBody<BatchOptions>(event)
  const { limit = 100, onlyUnmatched = true, forceReExtract = false } = body

  try {
    const filePath = join(process.cwd(), 'public/data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    const db = JSON.parse(content)

    // Get unmatched movies (no metadata)
    const movies = Object.entries(db)
      .filter(([id, movie]: [string, any]) => {
        if (id.startsWith('_')) return false
        if (onlyUnmatched && movie.metadata) return false
        if (!forceReExtract && movie.ai?.title) return false
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

          // Save immediately after each successful extraction to prevent data loss
          await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')
        } else {
          failedCount++
        }
      } catch (error) {
        console.error(`AI extraction failed for ${id}:`, error)
        failedCount++
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
