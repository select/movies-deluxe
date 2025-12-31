import { defineEventHandler, readBody, createError } from 'h3'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { isImdbId, generateArchiveId, generateYouTubeId } from '../../../../shared/types/movie'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { movieId, sourceId } = body

  if (!movieId || !sourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'movieId and sourceId are required',
    })
  }

  try {
    const filePath = join(process.cwd(), 'public/data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    const db = JSON.parse(content)

    const movie = db[movieId] as MovieEntry
    if (!movie) {
      throw createError({
        statusCode: 404,
        statusMessage: `Movie with ID ${movieId} not found`,
      })
    }

    const sourceIndex = movie.sources.findIndex(s => s.id === sourceId)
    if (sourceIndex === -1) {
      throw createError({
        statusCode: 404,
        statusMessage: `Source with ID ${sourceId} not found in movie ${movieId}`,
      })
    }

    // Remove the source
    movie.sources.splice(sourceIndex, 1)

    let finalMovieId = movieId
    let deleted = false

    if (movie.sources.length === 0) {
      // Delete the movie entry entirely
      delete db[movieId]
      finalMovieId = null
      deleted = true
    } else {
      // If it's a temporary ID, we might need to regenerate it based on the first remaining source
      // if the current ID was based on the removed source.
      // For simplicity, we always check if the ID should be updated for temporary IDs.
      if (!isImdbId(movieId)) {
        const remainingSource = movie.sources[0]
        if (!remainingSource) {
          // No remaining sources, movie should have been deleted above
          return
        }
        let newTempId = movieId
        if (remainingSource.type === 'youtube') {
          newTempId = generateYouTubeId(remainingSource.id)
        } else if (remainingSource.type === 'archive.org') {
          newTempId = generateArchiveId(remainingSource.id)
        }

        if (newTempId !== movieId) {
          const existing = db[newTempId] as MovieEntry | undefined
          if (existing) {
            // Merge remaining sources into existing entry
            existing.sources = [
              ...(existing.sources || []),
              ...movie.sources.filter(s => !(existing.sources || []).some(es => es.id === s.id)),
            ]
            existing.lastUpdated = new Date().toISOString()
            delete db[movieId]
            finalMovieId = newTempId
          } else {
            // Rename key
            movie.imdbId = newTempId
            db[newTempId] = movie
            delete db[movieId]
            finalMovieId = newTempId
          }
        }
      }

      if (finalMovieId && db[finalMovieId]) {
        db[finalMovieId].lastUpdated = new Date().toISOString()
      }
    }

    db._schema.lastUpdated = new Date().toISOString()
    await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')

    return {
      success: true,
      movieId: finalMovieId,
      deleted,
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to remove source: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
