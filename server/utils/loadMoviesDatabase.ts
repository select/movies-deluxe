/**
 * Load Movies Database from SQLite
 *
 * This module provides the loadMoviesDatabase() function that reads from data/movies.db
 * and reconstructs the MoviesDatabase object matching the old JSON structure.
 *
 * The function:
 * - Connects to data/movies.db using getAdminDatabase()
 * - Queries all movies with their sources, metadata, ratings, AI data, quality marks
 * - Reconstructs MoviesDatabase object matching the old JSON structure
 * - Includes _schema information from database
 * - Handles missing/optional fields gracefully
 */

import type {
  MoviesDatabase,
  MovieEntry,
  MovieSource,
  MovieMetadata,
  AIMetadata,
  DatabaseSchema,
} from '../../shared/types/movie'
import type Database from 'better-sqlite3'
import { getAdminDatabase } from './adminDb'

/**
 * Load the movies database from SQLite
 *
 * @returns Promise<MoviesDatabase> - The complete movies database matching the old JSON structure
 * @throws Error if database connection fails or database file doesn't exist
 */
export async function loadMoviesDatabase(): Promise<MoviesDatabase> {
  try {
    const db = getAdminDatabase()

    // Build the database object
    const moviesDb: MoviesDatabase = {
      _schema: await loadSchema(db),
    }

    // Query all movies
    const movies = db
      .prepare(
        `
      SELECT 
        movieId,
        title,
        year,
        verified,
        lastUpdated
      FROM movies
      ORDER BY movieId
    `
      )
      .all() as Array<{
      movieId: string
      title: string
      year: number | null
      verified: number
      lastUpdated: string
    }>

    // Load all auxiliary data in batch for performance
    const sourcesMap = await loadAllSources(db)
    const metadataMap = await loadAllMetadata(db)
    const aiMetadataMap = await loadAllAIMetadata(db)
    const relatedMoviesMap = await loadAllRelatedMovies(db)
    const collectionsMap = await loadAllCollections(db)

    // Process each movie and reconstruct the MovieEntry
    for (const movie of movies) {
      const entry: MovieEntry = {
        movieId: movie.movieId,
        title: movie.title,
        year: movie.year ?? undefined,
        verified: movie.verified === 1,
        lastUpdated: movie.lastUpdated,
        sources: sourcesMap.get(movie.movieId) || [],
      }

      // Load optional metadata
      const metadata = metadataMap.get(movie.movieId)
      if (metadata) {
        entry.metadata = metadata
      }

      // Load optional AI metadata
      const aiMetadata = aiMetadataMap.get(movie.movieId)
      if (aiMetadata) {
        entry.ai = aiMetadata
      }

      // Load related movies
      const relatedMovies = relatedMoviesMap.get(movie.movieId)
      if (relatedMovies && relatedMovies.length > 0) {
        entry.relatedMovies = relatedMovies
      }

      // Load collections
      const collections = collectionsMap.get(movie.movieId)
      if (collections && collections.length > 0) {
        entry.collections = collections
      }

      // Add entry to database
      moviesDb[movie.movieId] = entry
    }

    return moviesDb
  } catch (error) {
    // Check if it's a database file not found error
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error('Database file not found: data/movies.db. Please ensure the database exists.')
    }

    // Check if it's a database connection error
    if (error instanceof Error && error.message.includes('Failed to initialize admin database')) {
      throw new Error(`Failed to connect to database: ${error.message}`)
    }

    console.error('Failed to load movies database:', error)
    throw new Error(`Failed to load movies database: ${error}`)
  }
}

/**
 * Load schema information from the database
 */
async function loadSchema(db: Database.Database): Promise<DatabaseSchema> {
  const schemaRows = db
    .prepare(
      `
    SELECT key, value
    FROM _schema
    WHERE key IN ('version', 'description', 'last_updated')
  `
    )
    .all() as Array<{ key: string; value: string }>

  const schema: DatabaseSchema = {
    version: '1.0.0',
    description: 'Movies Deluxe Admin Database',
    lastUpdated: new Date().toISOString(),
  }

  for (const row of schemaRows) {
    if (row.key === 'version') {
      schema.version = row.value
    } else if (row.key === 'description') {
      schema.description = row.value
    } else if (row.key === 'last_updated') {
      schema.lastUpdated = row.value
    }
  }

  return schema
}

/**
 * Load all sources for all movies in a single batch query
 * Returns a Map of movieId -> MovieSource[]
 */
async function loadAllSources(db: Database.Database): Promise<Map<string, MovieSource[]>> {
  const sourcesMap = new Map<string, MovieSource[]>()

  // Load all sources in one query
  const allSources = db
    .prepare(
      `
    SELECT 
      id,
      movieId,
      type,
      url,
      sourceId,
      title,
      description,
      size,
      addedAt,
      thumbnail,
      duration,
      language,
      year,
      releaseYear,
      collection,
      downloads,
      channelName,
      channelId,
      publishedAt,
      viewCount,
      regionRestrictionAllowed,
      regionRestrictionBlocked
    FROM sources
    ORDER BY movieId, addedAt
  `
    )
    .all() as Array<{
    id: number
    movieId: string
    type: 'archive.org' | 'youtube'
    url: string
    sourceId: string
    title: string
    description: string | null
    size: number | null
    addedAt: string
    thumbnail: string | null
    duration: number | null
    language: string | null
    year: number | null
    releaseYear: number | null
    collection: string | null
    downloads: number | null
    channelName: string | null
    channelId: string | null
    publishedAt: string | null
    viewCount: number | null
    regionRestrictionAllowed: string | null
    regionRestrictionBlocked: string | null
  }>

  // Load all quality marks in one query
  const allQualityMarks = db
    .prepare(
      `
    SELECT sourceId, mark
    FROM source_quality_marks
    ORDER BY sourceId
  `
    )
    .all() as Array<{ sourceId: number; mark: string }>

  // Build quality marks map
  const qualityMarksMap = new Map<number, string[]>()
  for (const qm of allQualityMarks) {
    if (!qualityMarksMap.has(qm.sourceId)) {
      qualityMarksMap.set(qm.sourceId, [])
    }
    qualityMarksMap.get(qm.sourceId)!.push(qm.mark)
  }

  // Process sources and group by movieId
  for (const source of allSources) {
    // Build the source object
    const movieSource: MovieSource = {
      type: source.type,
      url: source.url,
      id: source.sourceId,
      title: source.title,
      addedAt: source.addedAt,
    }

    // Add optional fields
    if (source.description) movieSource.description = source.description
    if (source.size) movieSource.size = source.size
    if (source.thumbnail) movieSource.thumbnail = source.thumbnail
    if (source.duration) movieSource.duration = source.duration

    // Handle language field (stored as JSON for arrays)
    if (source.language) {
      try {
        const parsed = JSON.parse(source.language)
        movieSource.language = parsed
      } catch {
        // If not valid JSON, treat as string
        movieSource.language = source.language
      }
    }

    if (source.year) movieSource.year = source.year
    if (source.releaseYear) movieSource.releaseYear = source.releaseYear

    // Archive.org specific fields
    if (source.type === 'archive.org') {
      if (source.collection) movieSource.collection = source.collection
      if (source.downloads) movieSource.downloads = source.downloads
    }

    // YouTube specific fields
    if (source.type === 'youtube') {
      if (source.channelName) movieSource.channelName = source.channelName
      if (source.channelId) movieSource.channelId = source.channelId
      if (source.publishedAt) movieSource.publishedAt = source.publishedAt
      if (source.viewCount) movieSource.viewCount = source.viewCount

      // Handle region restrictions
      if (source.regionRestrictionAllowed || source.regionRestrictionBlocked) {
        movieSource.regionRestriction = {}
        if (source.regionRestrictionAllowed) {
          try {
            movieSource.regionRestriction.allowed = JSON.parse(source.regionRestrictionAllowed)
          } catch {
            // Ignore parsing errors
          }
        }
        if (source.regionRestrictionBlocked) {
          try {
            movieSource.regionRestriction.blocked = JSON.parse(source.regionRestrictionBlocked)
          } catch {
            // Ignore parsing errors
          }
        }
      }
    }

    // Add quality marks
    const qualityMarks = qualityMarksMap.get(source.id)
    if (qualityMarks && qualityMarks.length > 0) {
      movieSource.qualityMarks = qualityMarks
    }

    // Add to map
    if (!sourcesMap.has(source.movieId)) {
      sourcesMap.set(source.movieId, [])
    }
    sourcesMap.get(source.movieId)!.push(movieSource)
  }

  return sourcesMap
}

/**
 * Load all metadata for all movies in a single batch query
 * Returns a Map of movieId -> MovieMetadata
 */
async function loadAllMetadata(db: Database.Database): Promise<Map<string, MovieMetadata>> {
  const metadataMap = new Map<string, MovieMetadata>()

  // Load all metadata in one query
  const allMetadata = db
    .prepare(
      `
    SELECT 
      movieId,
      Title,
      Year,
      Rated,
      Released,
      Runtime,
      Genre,
      Director,
      Writer,
      Actors,
      Plot,
      Language,
      Country,
      Awards,
      Poster,
      Metascore,
      imdbRating,
      imdbVotes,
      imdbID,
      Type,
      Response
    FROM metadata
  `
    )
    .all() as Array<{
    movieId: string
    Title: string | null
    Year: string | null
    Rated: string | null
    Released: string | null
    Runtime: string | null
    Genre: string | null
    Director: string | null
    Writer: string | null
    Actors: string | null
    Plot: string | null
    Language: string | null
    Country: string | null
    Awards: string | null
    Poster: string | null
    Metascore: string | null
    imdbRating: number | null
    imdbVotes: number | null
    imdbID: string | null
    Type: string | null
    Response: string | null
  }>

  // Ratings table removed - imdbRating is already loaded from metadata table

  // Process metadata
  for (const metadata of allMetadata) {
    // Build metadata object with only non-null fields
    const result: MovieMetadata = {}

    if (metadata.Title) result.Title = metadata.Title
    if (metadata.Year) result.Year = metadata.Year
    if (metadata.Rated) result.Rated = metadata.Rated
    if (metadata.Runtime) result.Runtime = metadata.Runtime
    if (metadata.Genre) result.Genre = metadata.Genre
    if (metadata.Director) result.Director = metadata.Director
    if (metadata.Writer) result.Writer = metadata.Writer
    if (metadata.Actors) result.Actors = metadata.Actors
    if (metadata.Plot) result.Plot = metadata.Plot
    if (metadata.Language) result.Language = metadata.Language
    if (metadata.Country) result.Country = metadata.Country
    if (metadata.Awards) result.Awards = metadata.Awards
    if (metadata.imdbRating !== null) result.imdbRating = metadata.imdbRating
    if (metadata.imdbVotes !== null) result.imdbVotes = metadata.imdbVotes
    if (metadata.imdbID) result.imdbID = metadata.imdbID
    if (metadata.Type) result.Type = metadata.Type

    metadataMap.set(metadata.movieId, result)
  }

  return metadataMap
}

/**
 * Load all AI metadata for all movies in a single batch query
 * Returns a Map of movieId -> AIMetadata
 */
async function loadAllAIMetadata(db: Database.Database): Promise<Map<string, AIMetadata>> {
  const aiMetadataMap = new Map<string, AIMetadata>()

  const allAIMetadata = db
    .prepare(
      `
    SELECT movieId, title, year
    FROM ai_metadata
  `
    )
    .all() as Array<{
    movieId: string
    title: string | null
    year: number | null
  }>

  for (const aiMetadata of allAIMetadata) {
    if (!aiMetadata.title && !aiMetadata.year) {
      continue
    }

    const result: AIMetadata = {}
    if (aiMetadata.title) result.title = aiMetadata.title
    if (aiMetadata.year) result.year = aiMetadata.year

    aiMetadataMap.set(aiMetadata.movieId, result)
  }

  return aiMetadataMap
}

/**
 * Load all related movies for all movies in a single batch query
 * Returns a Map of movieId -> string[]
 */
async function loadAllRelatedMovies(db: Database.Database): Promise<Map<string, string[]>> {
  const relatedMoviesMap = new Map<string, string[]>()

  const allRelated = db
    .prepare(
      `
    SELECT movieId, relatedMovieId
    FROM related_movies
    ORDER BY movieId
  `
    )
    .all() as Array<{ movieId: string; relatedMovieId: string }>

  for (const related of allRelated) {
    if (!relatedMoviesMap.has(related.movieId)) {
      relatedMoviesMap.set(related.movieId, [])
    }
    relatedMoviesMap.get(related.movieId)!.push(related.relatedMovieId)
  }

  return relatedMoviesMap
}

/**
 * Load all collections for all movies in a single batch query
 * Returns a Map of movieId -> Array<{id: string, name: string}>
 */
async function loadAllCollections(
  db: Database.Database
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const collectionsMap = new Map<string, Array<{ id: string; name: string }>>()

  const allCollections = db
    .prepare(
      `
    SELECT cm.movieId, c.id, c.name
    FROM collections c
    JOIN collection_movies cm ON c.id = cm.collectionId
    ORDER BY cm.movieId
  `
    )
    .all() as Array<{ movieId: string; id: string; name: string }>

  for (const collection of allCollections) {
    if (!collectionsMap.has(collection.movieId)) {
      collectionsMap.set(collection.movieId, [])
    }
    collectionsMap.get(collection.movieId)!.push({ id: collection.id, name: collection.name })
  }

  return collectionsMap
}
