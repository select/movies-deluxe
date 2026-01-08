import { generateHomePages } from '../../../utils/generateHomePages'

export default defineEventHandler(async () => {
  try {
    emitProgress({
      type: 'home',
      status: 'starting',
      message: 'Starting home page generation...',
      current: 0,
      total: 31,
    })

    await generateHomePages(progress => {
      emitProgress({
        type: 'home',
        status: 'in_progress',
        current: progress.current,
        total: progress.total,
        message: progress.message,
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
