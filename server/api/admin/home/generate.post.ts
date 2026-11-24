import { generateHomePages } from '../../../utils/generateHomePages'
import { defineEventHandler } from 'h3'
import { emitProgress } from '#server/utils/progress'

export default defineEventHandler(async () => {
  try {
    emitProgress({
      type: 'home',
      status: 'starting',
      message: 'Starting home page generation...',
      current: 0,
      total: 31,
    })

    const startTime = Date.now()

    await generateHomePages(progress => {
      const elapsedSec = (Date.now() - startTime) / 1000
      const rate =
        progress.current > 0 && elapsedSec > 0.5
          ? Number((progress.current / elapsedSec).toFixed(1))
          : 0
      const remaining =
        rate > 0 && progress.total > progress.current
          ? Math.round((progress.total - progress.current) / rate)
          : undefined
      emitProgress({
        type: 'home',
        status: 'in_progress',
        current: progress.current,
        total: progress.total,
        message: progress.message,
        embeddingsPerSecond: rate || undefined,
        estimatedTimeRemaining: remaining,
      })
    })

    emitProgress({
      type: 'home',
      status: 'completed',
      message: 'Home page generation completed successfully',
      current: 31,
      total: 31,
    })

    return {
      success: true,
      message: 'Home page collections generated successfully',
    }
  } catch (error: unknown) {
    console.error('Home page generation failed:', error)

    emitProgress({
      type: 'home',
      status: 'error',
      message: `Home page generation failed: ${error instanceof Error ? error.message : String(error)}`,
      current: 0,
      total: 31,
    })

    return {
      success: false,
      message: `Failed to generate home page collections: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
})
