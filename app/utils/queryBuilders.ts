/**
 * SQL Query Builders
 *
 * Centralized query construction for all database operations.
 * These functions build SQL queries with parameters that are executed by the database worker.
 *
 * Benefits:
 * - Single source of truth for all SQL queries
 * - Better testability (query logic can be unit tested)
 * - Easier maintenance (all query logic in one place)
 * - Type safety for query parameters
 */

export interface QueryResult {
  sql: string
  params: (string | number)[]
}

export interface VectorSearchQueryResult extends QueryResult {
  /** Limit for k-nearest neighbors */
  limit: number
}

export interface FilterOptionsQueries {
  genres: QueryResult
  countries: QueryResult
  channels: QueryResult
}

/**
 * Build query to fetch lightweight movie details by IDs
 */
export function buildQueryByIdsQuery(movieIds: string[]): QueryResult {
  const placeholders = movieIds.map(() => '?').join(',')
  return {
    sql: `
      SELECT m.movieId, m.title, m.year, m.imdbRating, m.imdbVotes, m.language,
             m.primarySourceType as sourceType, m.primaryChannelName as channelName,
             m.verified, m.lastUpdated, m.genre, m.country
      FROM movies m
      WHERE m.movieId IN (${placeholders})
    `,
    params: movieIds,
  }
}

/**
 * Build query for vector similarity search
 *
 * Note: The embedding parameter is handled separately by the worker
 * since it requires special ArrayBuffer conversion.
 */
export function buildVectorSearchQuery(
  limit: number,
  where?: string,
  whereParams?: (string | number)[]
): VectorSearchQueryResult {
  let sql = `
    SELECT 
      m.movieId, m.title, m.year, m.imdbRating, m.imdbVotes, m.language,
      m.primarySourceType as sourceType, m.primaryChannelName as channelName,
      m.verified, m.lastUpdated, m.genre, m.country,
      v.distance
    FROM vec_movies v
    INNER JOIN movies m ON v.movieId = m.movieId
    WHERE v.embedding MATCH ?
      AND k = ?
  `

  const params: (string | number)[] = []

  if (where) {
    sql += ` AND ${where}`
    if (whereParams) {
      params.push(...whereParams)
    }
  }

  sql += ` ORDER BY v.distance ASC`

  return { sql, params, limit }
}

/**
 * Build query to get collections for a specific movie
 */
export function buildCollectionsForMovieQuery(movieId: string): QueryResult {
  return {
    sql: `
      SELECT c.id, c.name, c.description, c.createdAt, c.updatedAt
      FROM collections c
      INNER JOIN collection_movies cm ON c.id = cm.collectionId
      WHERE cm.movieId = ?
      ORDER BY c.name ASC
    `,
    params: [movieId],
  }
}

/**
 * Build queries for filter options (genres, countries, channels)
 */
export function buildFilterOptionsQueries(): FilterOptionsQueries {
  return {
    genres: {
      sql: 'SELECT name, movie_count as count FROM genres ORDER BY movie_count DESC, name ASC',
      params: [],
    },
    countries: {
      sql: 'SELECT name, movie_count as count FROM countries ORDER BY movie_count DESC, name ASC',
      params: [],
    },
    channels: {
      sql: `
        SELECT primaryChannelName as name, COUNT(*) as count
        FROM movies
        WHERE primaryChannelName IS NOT NULL
        GROUP BY primaryChannelName
        ORDER BY count DESC, primaryChannelName ASC
      `,
      params: [],
    },
  }
}
