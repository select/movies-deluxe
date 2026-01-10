import { defineEventHandler, readBody, createError } from 'h3'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry } from '../../../../shared/types/movie'

const MOVIES_DB_PATH = join(process.cwd(), 'data/movies.json')

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { movieId, sourceId, qualityMarks } = body

  if (!movieId || !sourceId) {
    throw createError({
      statusCode: 400,
      message: 'Missing movieId or sourceId',
    })
  }

  try {
    // Read database
    const dbContent = await readFile(MOVIES_DB_PATH, 'utf-8')
    const db: MoviesDatabase = JSON.parse(dbContent)

    const movie = db[movieId]

    if (!movie || typeof movie === 'string') {
      throw createError({
        statusCode: 404,
        message: 'Movie not found',
      })
    }

    // Type guard to ensure it's a MovieEntry
    const movieEntry = movie as MovieEntry

    // Find and update the source
    const sourceIndex = movieEntry.sources.findIndex(s => s.id === sourceId)
    if (sourceIndex === -1) {
      throw createError({
        statusCode: 404,
        message: 'Source not found',
      })
    }

    const source = movieEntry.sources[sourceIndex]
    if (!source) {
      throw createError({
        statusCode: 404,
        message: 'Source not found',
      })
    }

    // Update the source quality marks
    source.qualityMarks = qualityMarks && qualityMarks.length > 0 ? qualityMarks : undefined
    movieEntry.lastUpdated = new Date().toISOString()

    // Write back to database
    await writeFile(MOVIES_DB_PATH, JSON.stringify(db, null, 2), 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('Failed to update source quality:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to update source quality',
    })
  }
})
