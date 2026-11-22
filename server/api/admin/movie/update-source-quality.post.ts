import { defineEventHandler, readBody, createError } from 'h3'
import { withTransaction } from '../../../utils/adminDb'

export default defineEventHandler(async event => {
  const body = await readBody<{
    movieId?: string
    sourceId?: string | number
    qualityMarks?: string[]
  }>(event)
  const { movieId, sourceId, qualityMarks } = body

  if (!movieId || sourceId === undefined || sourceId === null || sourceId === '') {
    throw createError({
      statusCode: 400,
      message: 'Missing movieId or sourceId',
    })
  }

  try {
    const now = new Date().toISOString()

    await withTransaction(async db => {
      const movie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(movieId) as
        | { movieId: string }
        | undefined

      if (!movie) {
        throw createError({
          statusCode: 404,
          message: 'Movie not found',
        })
      }

      const source = db
        .prepare('SELECT id FROM sources WHERE movieId = ? AND (sourceId = ? OR id = ?)')
        .get(movieId, String(sourceId), sourceId) as { id: number } | undefined

      if (!source) {
        throw createError({
          statusCode: 404,
          message: 'Source not found',
        })
      }

      db.prepare('DELETE FROM source_quality_marks WHERE sourceId = ?').run(source.id)

      if (Array.isArray(qualityMarks) && qualityMarks.length > 0) {
        const insertMark = db.prepare(`
          INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt)
          VALUES (?, ?, ?)
        `)
        for (const mark of qualityMarks) {
          insertMark.run(source.id, mark, now)
        }
      }

      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(now, movieId)
    })

    return { success: true }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('Failed to update source quality:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to update source quality',
    })
  }
})
