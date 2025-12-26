import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execPromise = promisify(exec)

export default defineEventHandler(async () => {
  try {
    emitProgress({
      type: 'sqlite',
      status: 'starting',
      message: 'Starting SQLite generation...',
      current: 0,
      total: 100,
    })

    // Run the generation script as a separate process
    // This avoids issues with native bindings in the main Nitro process if any
    const { stdout, stderr } = await execPromise('pnpm db:generate')

    if (stderr && !stdout) {
      throw new Error(stderr)
    }

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
      output: stdout,
    }
  } catch (error: any) {
    console.error('SQLite generation failed:', error)

    emitProgress({
      type: 'sqlite',
      status: 'error',
      message: `SQLite generation failed: ${error.message}`,
      current: 0,
      total: 100,
    })

    return {
      success: false,
      message: `Failed to generate SQLite database: ${error.message}`,
    }
  }
})
