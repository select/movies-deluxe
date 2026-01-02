import { defineEventHandler } from 'h3'
import { readFile } from 'fs/promises'
import { join } from 'path'

export default defineEventHandler(async () => {
  try {
    const filePath = join(process.cwd(), 'data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    return {
      error: true,
      message: 'Failed to load movies',
      details: error instanceof Error ? error.message : String(error),
    }
  }
})
