import { generateSQLite } from '../../../../scripts/generate-sqlite'

export default defineEventHandler(async () => {
  try {
    emitProgress({
      type: 'sqlite',
      status: 'starting',
      message: 'Starting SQLite generation...',
      current: 0,
      total: 100,
    })

    // Call the generation function directly with progress callback
    await generateSQLite(progress => {
      emitProgress({
        type: 'sqlite',
        status: 'in_progress',
        current: progress.current,
        total: progress.total,
        message: progress.message,
      })
    })

    emitProgress({
      type: 'sqlite',
      status: 'completed',
      message: 'SQLite generation completed successfully',
      current: 100,
      total: 100,
    })

    return {
      success: true,
      message: 'SQLite database generated successfully',
    }
  } catch (error: unknown) {
    console.error('SQLite generation failed:', error)

    emitProgress({
      type: 'sqlite',
      status: 'error',
      message: `SQLite generation failed: ${error instanceof Error ? error.message : String(error)}`,
      current: 0,
      total: 100,
    })

    return {
      success: false,
      message: `Failed to generate SQLite database: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
})
