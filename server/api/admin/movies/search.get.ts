import { defineEventHandler, getQuery, createError } from 'h3'
import { getAdminDatabase } from '../../../utils/adminDb'

interface MovieRow {
  movieId: string
  title: string
  year: number | null
  verified: number
  lastUpdated: string
}

interface MetadataRow {
  Poster: string | null
  Director: string | null
  Writer: string | null
  Actors: string | null
  Plot: string | null
  Genre: string | null
  Country: string | null
  imdbRating: number | null
  imdbVotes: number | null
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const q = ((query.q as string) || '').toLowerCase().trim()

  // Parse filter parameters
  const minRating = query.minRating ? Number(query.minRating) : 0
  const minYear = query.minYear ? Number(query.minYear) : 0
  const maxYear = query.maxYear ? Number(query.maxYear) : 0
  const minVotes = query.minVotes ? Number(query.minVotes) : 0
  const maxVotes = query.maxVotes ? Number(query.maxVotes) : 0
  const genres = query.genres ? (query.genres as string).split(',').filter(Boolean) : []
  const countries = query.countries ? (query.countries as string).split(',').filter(Boolean) : []
  const sources = query.sources ? (query.sources as string).split(',').filter(Boolean) : []

  const hasFilters =
    minRating > 0 ||
    minYear > 0 ||
    maxYear > 0 ||
    minVotes > 0 ||
    maxVotes > 0 ||
    genres.length > 0 ||
    countries.length > 0 ||
    sources.length > 0

  // Require either search query or filters
  if (!q && !hasFilters) {
    return []
  }

  try {
    const db = getAdminDatabase()

    // Build SQL query dynamically
    const conditions: string[] = []
    const params: (string | number)[] = []

    // Full-text search on title and metadata fields
    if (q) {
      // Search in movies table (title) and metadata (Director, Writer, Actors, Plot)
      conditions.push(
        `(
          movieId IN (SELECT movieId FROM fts_movies WHERE fts_movies MATCH ?)
          OR movieId IN (
            SELECT movieId FROM metadata 
            WHERE LOWER(Director) LIKE ?
            OR LOWER(Writer) LIKE ?
            OR LOWER(Actors) LIKE ?
            OR LOWER(Plot) LIKE ?
          )
          OR LOWER(movieId) LIKE ?
        )`
      )
      const searchPattern = `%${q}%`
      params.push(q, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
    }

    // Year filters
    if (minYear > 0) {
      conditions.push('year >= ?')
      params.push(minYear)
    }
    if (maxYear > 0) {
      conditions.push('year <= ?')
      params.push(maxYear)
    }

    // Rating filter - only include movies with ratings >= minRating
    if (minRating > 0) {
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE imdbRating IS NOT NULL AND imdbRating >= ?
        )`
      )
      params.push(minRating)
    }

    // Votes filter - only include movies with votes in range
    if (minVotes > 0) {
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE imdbVotes IS NOT NULL AND imdbVotes >= ?
        )`
      )
      params.push(minVotes)
    }
    if (maxVotes > 0) {
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE imdbVotes IS NOT NULL AND imdbVotes <= ?
        )`
      )
      params.push(maxVotes)
    }

    // Genre filter - support multiple genres (any match)
    if (genres.length > 0) {
      const genreConditions = genres.map(() => 'Genre LIKE ?').join(' OR ')
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE ${genreConditions}
        )`
      )
      genres.forEach(genre => params.push(`%${genre}%`))
    }

    // Country filter - support multiple countries (any match)
    if (countries.length > 0) {
      const countryConditions = countries.map(() => 'Country LIKE ?').join(' OR ')
      conditions.push(
        `movieId IN (
          SELECT movieId FROM metadata 
          WHERE ${countryConditions}
        )`
      )
      countries.forEach(country => params.push(`%${country}%`))
    }

    // Source filter - support archive.org and specific YouTube channels
    if (sources.length > 0) {
      const sourceConditions: string[] = []
      const sourceParams: (string | number)[] = []

      // Check for archive.org sources
      if (sources.includes('archive.org')) {
        sourceConditions.push(`type = 'archive.org'`)
      }

      // Check for YouTube channels
      const youtubeChannels = sources.filter(s => s !== 'archive.org')
      if (youtubeChannels.length > 0) {
        const channelPlaceholders = youtubeChannels.map(() => '?').join(',')
        sourceConditions.push(`(type = 'youtube' AND channelName IN (${channelPlaceholders}))`)
        sourceParams.push(...youtubeChannels)
      }

      if (sourceConditions.length > 0) {
        conditions.push(
          `movieId IN (
            SELECT DISTINCT movieId FROM sources 
            WHERE ${sourceConditions.join(' OR ')}
          )`
        )
        params.push(...sourceParams)
      }
    }

    // Exclude movies that have ONLY sources with quality marks
    // (i.e., require at least one clean source)
    conditions.push(
      `movieId IN (
        SELECT DISTINCT s.movieId 
        FROM sources s
        LEFT JOIN source_quality_marks sqm ON s.id = sqm.sourceId
        GROUP BY s.movieId, s.id
        HAVING COUNT(sqm.mark) = 0
      )`
    )

    // Build final query
    let sql = `
      SELECT m.movieId, m.title, m.year
      FROM movies m
    `

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    // Sort by title and limit to 300 results
    sql += ' ORDER BY m.title COLLATE NOCASE LIMIT 300'

    // Execute query to get movie IDs
    const movies = db.prepare(sql).all(...params) as MovieRow[]

    // Batch fetch metadata for all movies
    const movieIds = movies.map(m => m.movieId)
    const metadataMap = new Map<string, MetadataRow>()

    if (movieIds.length > 0) {
      const placeholders = movieIds.map(() => '?').join(',')
      const metadataQuery = `
        SELECT 
          movieId,
          Poster,
          Director,
          Writer,
          Plot,
          imdbRating,
          imdbVotes
        FROM metadata
        WHERE movieId IN (${placeholders})
      `
      const metadataRows = db.prepare(metadataQuery).all(...movieIds) as (MetadataRow & {
        movieId: string
      })[]
      metadataRows.forEach(row => {
        metadataMap.set(row.movieId, row)
      })
    }

    // Build results
    const results = movies.map(movie => {
      const metadata = metadataMap.get(movie.movieId)
      return {
        movieId: movie.movieId,
        title: movie.title,
        year: movie.year ?? undefined,
        metadata: metadata
          ? {
              Poster: metadata.Poster ?? undefined,
              Director: metadata.Director ?? undefined,
              Writer: metadata.Writer ?? undefined,
              Plot: metadata.Plot ?? undefined,
              imdbRating:
                typeof metadata.imdbRating === 'number'
                  ? metadata.imdbRating.toString()
                  : undefined,
              imdbVotes: metadata.imdbVotes ?? undefined,
            }
          : undefined,
      }
    })

    return results
  } catch (error) {
    console.error('[admin/movies/search] Error searching movies:', error)
    throw createError({
      statusCode: 500,
      message: `Failed to search movies: ${error}`,
    })
  }
})
