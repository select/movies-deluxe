import { defineEventHandler, getRouterParam, createError } from 'h3'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Movie ID is required',
    })
  }

  try {
    const filePath = join(process.cwd(), 'public/movies', `${id}.json`)

    if (!existsSync(filePath)) {
      throw createError({
        statusCode: 404,
        statusMessage: `Movie with ID ${id} not found`,
      })
    }

    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)
      throw error

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load movie details',
      data: error instanceof Error ? error.message : String(error),
    })
  }
})
