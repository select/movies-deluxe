import { defineEventHandler, readBody, createError } from 'h3'
import {
  isImdbId,
  generateArchiveId,
  generateYouTubeId,
  type MovieEntry,
  type MovieSource,
} from '../../../../shared/types/movie'
import { withTransaction } from '../../../utils/adminDb'
import { upsertMovie } from '../../../utils/upsertMovie'
import type Database from 'better-sqlite3'

/**
 * Helper function to load a complete movie entry from the database
 */
function loadMovieById(db: Database.Database, movieId: string): MovieEntry | null {
  // Load movie record
  const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
    | { movieId: string; title: string; year: number | null; verified: number; lastUpdated: string }
    | undefined

  if (!movie) {
    return null
  }

  // Load sources with channel data
  const sources = db
    .prepare(
      `
      SELECT s.*, c.platform as type, c.name as channelName
      FROM sources s
      JOIN channels c ON s.channelId = c.id
      WHERE s.movieId = ?
    `
    )
    .all(movieId) as Array<{
    id: number
    movieId: string
    sourceId: string
    channelId: string
    title: string
    description: string | null
    size: number | null
    addedAt: number
    duration: number | null
    language: string | null
    year: number | null
    downloads: number | null
    viewCount: number | null
    regionRestriction: string | null
    type: string
    channelName: string
  }>

  // Load quality marks for each source
  const sourcesWithMarks: MovieSource[] = sources.map(source => {
    const marks = db
      .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
      .all(source.id) as { mark: string }[]

    return {
      channelId: source.channelId,
      sourceId: source.sourceId,
      id: source.sourceId,
      title: source.title,
      description: source.description || undefined,
      qualityMarks: marks.length > 0 ? marks.map(m => m.mark) : undefined,
      size: source.size || undefined,
      addedAt: source.addedAt,
      duration: source.duration || undefined,
      language: source.language || undefined,
      year: source.year || undefined,
      downloads: source.downloads || undefined,
      viewCount: source.viewCount || undefined,
      regionRestriction: source.regionRestriction
        ? JSON.parse(source.regionRestriction)
        : undefined,
      type: source.type as 'archive.org' | 'youtube',
      channelName: source.channelName,
    }
  })

  return {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year || undefined,
    sources: sourcesWithMarks,
    verified: movie.verified === 1,
    lastUpdated: movie.lastUpdated,
  }
}

/**
 * Delete a movie and all its related data
 */
async function deleteMovie(db: Database.Database, movieId: string): Promise<void> {
  // Delete from collection_movies
  db.prepare('DELETE FROM collection_movies WHERE movieId = ?').run(movieId)

  // Delete quality marks for all sources
  db.prepare(
    `
    DELETE FROM source_quality_marks 
    WHERE sourceId IN (SELECT id FROM sources WHERE movieId = ?)
  `
  ).run(movieId)

  // Delete sources
  db.prepare('DELETE FROM sources WHERE movieId = ?').run(movieId)

  // Delete metadata
  db.prepare('DELETE FROM metadata WHERE movieId = ?').run(movieId)

  // Delete AI metadata
  db.prepare('DELETE FROM ai_metadata WHERE movieId = ?').run(movieId)

  // Delete related movies
  db.prepare('DELETE FROM related_movies WHERE movieId = ? OR relatedMovieId = ?').run(
    movieId,
    movieId
  )

  // Delete movie
  db.prepare('DELETE FROM movies WHERE movieId = ?').run(movieId)
}

/**
 * Update collection references from old ID to new ID
 */
async function updateMovieIdInCollections(
  db: Database.Database,
  oldId: string,
  newId: string
): Promise<void> {
  db.prepare('UPDATE collection_movies SET movieId = ? WHERE movieId = ?').run(newId, oldId)
}

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
    return await withTransaction(async db => {
      // Load the movie
      const movie = loadMovieById(db, movieId)
      if (!movie) {
        throw createError({
          statusCode: 404,
          statusMessage: `Movie with ID ${movieId} not found`,
        })
      }

      // Find the source to remove
      const sourceIndex = movie.sources.findIndex(s => s.id === sourceId)
      if (sourceIndex === -1) {
        throw createError({
          statusCode: 404,
          statusMessage: `Source with ID ${sourceId} not found in movie ${movieId}`,
        })
      }

      // Recreate the removed source as a new standalone movie entry
      const removedSource = movie.sources[sourceIndex]!
      movie.sources.splice(sourceIndex, 1)

      let removedSourceTempId: string
      if (removedSource.type === 'youtube') {
        removedSourceTempId = generateYouTubeId(removedSource.id)
      } else {
        removedSourceTempId = generateArchiveId(removedSource.id)
      }

      // Only recreate if it's not the same as the current movie
      if (removedSourceTempId !== movieId) {
        const existingMovie = loadMovieById(db, removedSourceTempId)

        if (!existingMovie) {
          // Create new entry
          const newEntry: MovieEntry = {
            movieId: removedSourceTempId,
            title: removedSource.title || 'Untitled',
            sources: [removedSource],
            lastUpdated: new Date().toISOString(),
            year: removedSource.year,
          }

          await upsertMovie(removedSourceTempId, newEntry)
        } else {
          // If it already exists, merge the source if not already there
          if (!existingMovie.sources.some(s => s.id === removedSource.id)) {
            existingMovie.sources.push(removedSource)
            existingMovie.lastUpdated = new Date().toISOString()
            await upsertMovie(removedSourceTempId, existingMovie)
          }
        }
      }

      let finalMovieId: string | null = movieId
      let deleted = false

      if (movie.sources.length === 0) {
        // Delete the movie entry entirely
        await deleteMovie(db, movieId)
        finalMovieId = null
        deleted = true
      } else {
        // If it's a temporary ID, check if we need to regenerate it
        if (!isImdbId(movieId)) {
          const remainingSource = movie.sources[0]
          if (!remainingSource) {
            return { success: true, movieId: null, deleted: true }
          }

          let newTempId = movieId
          if (remainingSource.type === 'youtube') {
            newTempId = generateYouTubeId(remainingSource.id)
          } else if (remainingSource.type === 'archive.org') {
            newTempId = generateArchiveId(remainingSource.id)
          }

          if (newTempId !== movieId) {
            // Check if newTempId already exists
            const targetMovie = loadMovieById(db, newTempId)

            if (targetMovie) {
              // Merge sources into target movie
              for (const source of movie.sources) {
                if (!targetMovie.sources.some(s => s.id === source.id)) {
                  targetMovie.sources.push(source)
                }
              }
              targetMovie.lastUpdated = new Date().toISOString()
              await upsertMovie(newTempId, targetMovie)

              // Delete old movie
              await deleteMovie(db, movieId)
            } else {
              // Rename movie
              db.prepare('UPDATE movies SET movieId = ? WHERE movieId = ?').run(newTempId, movieId)
              db.prepare('UPDATE sources SET movieId = ? WHERE movieId = ?').run(newTempId, movieId)
              db.prepare('UPDATE metadata SET movieId = ? WHERE movieId = ?').run(
                newTempId,
                movieId
              )
              db.prepare('UPDATE ai_metadata SET movieId = ? WHERE movieId = ?').run(
                newTempId,
                movieId
              )
              db.prepare('UPDATE related_movies SET movieId = ? WHERE movieId = ?').run(
                newTempId,
                movieId
              )
              db.prepare(
                'UPDATE related_movies SET relatedMovieId = ? WHERE relatedMovieId = ?'
              ).run(newTempId, movieId)

              // Update collections
              await updateMovieIdInCollections(db, movieId, newTempId)
            }

            finalMovieId = newTempId
          }
        }

        // Update lastUpdated timestamp
        if (finalMovieId) {
          db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(
            new Date().toISOString(),
            finalMovieId
          )
        }
      }

      return {
        success: true,
        movieId: finalMovieId,
        deleted,
      }
    })
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to remove source: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
