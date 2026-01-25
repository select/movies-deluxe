import { generateSQLite } from '../../../utils/generateSQLite'

export default defineEventHandler(async event => {
  // Only allow from localhost
  const host = getRequestHeader(event, 'host')
  if (!host?.startsWith('localhost') && !host?.startsWith('127.0.0.1')) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const body = await readBody(event)
  const skipJson = body?.skipJsonGeneration || false

  try {
    emitProgress({
      type: 'sqlite',
      status: 'starting',
      message: 'Starting SQLite generation...',
      current: 0,
      total: 100,
    })

    // Call the generation function with progress callback
    await generateSQLite({
      skipJsonGeneration: skipJson,
      onProgress: progress => {
        emitProgress({
          type: 'sqlite',
          status: 'in_progress',
          current: progress.current,
          total: progress.total,
          message: progress.message,
        })
      },
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
