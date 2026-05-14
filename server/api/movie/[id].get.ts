import { defineEventHandler, getRouterParam, createError } from 'h3'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getAdminDatabase } from '../../utils/adminDb'
import type { MovieSource, MovieMetadata, MovieSourceType } from '../../../shared/types/movie'

/**
 * Get movie by ID.
 *
 * In production (prerender): reads from pre-generated JSON files.
 * In dev mode: falls back to querying the admin database directly
 * if the JSON file doesn't exist.
 */
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Movie ID is required',
    })
  }

  try {
    // Try reading from pre-generated JSON first
    const filePath = join(process.cwd(), 'public/movies', `${id}.json`)

    if (existsSync(filePath)) {
      const content = await readFile(filePath, 'utf-8')
      return JSON.parse(content)
    }

    // Fallback: query admin database directly (dev mode)
    return getMovieFromAdminDb(id)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)
      throw error
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 400)
      throw error

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load movie details',
      data: error instanceof Error ? error.message : String(error),
    })
  }
})

async function getMovieFromAdminDb(movieId: string) {
  const db = getAdminDatabase()

  // Get movie base data
  const movie = db
    .prepare('SELECT movieId, title, year, verified, lastUpdated FROM movies WHERE movieId = ?')
    .get(movieId) as
    | { movieId: string; title: string; year: number | null; verified: number; lastUpdated: string }
    | undefined

  if (!movie) {
    throw createError({
      statusCode: 404,
      statusMessage: `Movie with ID "${movieId}" not found`,
    })
  }

  // Get sources (excluding quality-marked ones)
  const sources = db
    .prepare(
      `
      SELECT
        s.id, s.sourceId, s.title, s.description, s.size, s.addedAt,
        s.duration, s.language, s.year, s.downloads, s.viewCount,
        s.regionRestriction,
        c.id as channelId, c.name as channelName, c.platform as type
      FROM sources s
      JOIN channels c ON s.channelId = c.id
      WHERE s.movieId = ?
        AND NOT EXISTS (
          SELECT 1 FROM source_quality_marks sqm WHERE sqm.sourceId = s.id
        )
      ORDER BY
        CASE c.platform WHEN 'archive.org' THEN 1 WHEN 'youtube' THEN 2 ELSE 3 END,
        s.addedAt
    `
    )
    .all(movieId) as Array<Record<string, unknown>>

  if (sources.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: `Movie with ID "${movieId}" not found`,
    })
  }

  const mappedSources: MovieSource[] = sources.map(s => ({
    channelId: s.channelId as string,
    sourceId: s.sourceId as string,
    id: s.id as string,
    title: s.title as string,
    description: s.description as string | undefined,
    size: s.size as number | undefined,
    addedAt: s.addedAt as number | undefined,
    duration: s.duration as number | undefined,
    language: s.language as string | undefined,
    year: s.year as number | undefined,
    downloads: s.downloads as number | undefined,
    viewCount: s.viewCount as number | undefined,
    regionRestriction: s.regionRestriction ? JSON.parse(s.regionRestriction as string) : undefined,
    type: s.type as MovieSourceType,
    channelName: s.channelName as string,
  }))

  // Get metadata
  const meta = db
    .prepare(
      `
      SELECT Rated, Runtime, Genre, Director, Writer, Actors, Plot,
             Language, Country, Awards, imdbRating, imdbVotes
      FROM metadata WHERE movieId = ?
    `
    )
    .get(movieId) as Record<string, unknown> | undefined

  let metadata: MovieMetadata | undefined
  if (meta) {
    metadata = {}
    if (meta.Rated) metadata.Rated = meta.Rated as string
    if (meta.Runtime) metadata.Runtime = meta.Runtime as string
    if (meta.Genre) metadata.Genre = meta.Genre as string
    if (meta.Director) metadata.Director = meta.Director as string
    if (meta.Writer) metadata.Writer = meta.Writer as string
    if (meta.Actors) metadata.Actors = meta.Actors as string
    if (meta.Plot) metadata.Plot = meta.Plot as string
    if (meta.Language) metadata.Language = meta.Language as string
    if (meta.Country) metadata.Country = meta.Country as string
    if (meta.Awards) metadata.Awards = meta.Awards as string
    if (meta.imdbRating != null) metadata.imdbRating = meta.imdbRating as number
    if (meta.imdbVotes != null) metadata.imdbVotes = meta.imdbVotes as number
  }

  // Get related movies
  const related = db
    .prepare('SELECT relatedMovieId FROM related_movies WHERE movieId = ?')
    .all(movieId) as Array<{ relatedMovieId: string }>

  // Get collections
  const collections = db
    .prepare(
      `
      SELECT c.id, c.name
      FROM collections c
      JOIN collection_movies cm ON cm.collectionId = c.id
      WHERE cm.movieId = ?
    `
    )
    .all(movieId) as Array<{ id: string; name: string }>

  // Get similar movies from precomputed DB
  let similarMovies: Array<{ movieId: string; distance: number }> = []
  const similarDbPath = join(process.cwd(), 'data/similar-movies.db')
  if (existsSync(similarDbPath)) {
    const Database = (await import('better-sqlite3')).default
    const similarDb = new Database(similarDbPath, { readonly: true })
    similarMovies = similarDb
      .prepare(
        'SELECT similarMovieId as movieId, distance FROM similar_movies WHERE movieId = ? ORDER BY rank'
      )
      .all(movieId) as Array<{ movieId: string; distance: number }>
    similarDb.close()
  }

  return {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year,
    sources: mappedSources,
    metadata,
    relatedMovies: related.map(r => r.relatedMovieId),
    similarMovies,
    collections,
    verified: !!movie.verified,
    lastUpdated: movie.lastUpdated,
  }
}
