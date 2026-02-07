/**
 * OMDB Enrichment API Endpoint
 *
 * Enriches movies with OMDB metadata by matching unmatched movies
 * or re-enriching existing movies. Uses SQLite for direct database access.
 */

// Note: The following functions are auto-imported from server/utils/:
// - extractMovieKeys (from movieData.ts)
// - loadFailedOmdbMatches, saveFailedOmdbMatch, clearFailedOmdbMatches, removeFailedOmdbMatch (from failedOmdb.ts)
// - matchMovie (from omdb.ts)
// - emitProgress (from progress.ts)
// - cleanTitleGeneral, extractYearAndCleanTitle (from titleCleaner.ts)

// Explicitly import SQLite-based functions to avoid auto-import conflicts
import { migrateMovieId } from '../../../utils/migrateMovieId'
import { upsertMovie } from '../../../utils/upsertMovie'
import { getAdminDatabase } from '../../../utils/adminDb'
import type Database from 'better-sqlite3'

/**
 * Load a complete movie entry from the SQLite database
 */
async function loadMovieFromDb(db: Database.Database, movieId: string): Promise<MovieEntry | null> {
  // Load movie record
  const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
    | { movieId: string; title: string; year: number; verified: number; lastUpdated: string }
    | undefined

  if (!movie) {
    return null
  }

  // Load sources
  interface SourceRow {
    id: number
    movieId: string
    sourceId: string
    type: string
    url: string
    title: string
    description: string | null
    label: string | null
    quality: string | null
    fileSize: number | null
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
  }

  const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(movieId) as SourceRow[]

  // Load quality marks for each source
  const sourcesWithMarks: MovieSource[] = sources.map(source => {
    const marks = db
      .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
      .all(source.id) as { mark: string }[]

    // Parse JSON fields
    let regionRestriction: { allowed?: string[]; blocked?: string[] } | undefined = undefined
    if (source.regionRestrictionAllowed || source.regionRestrictionBlocked) {
      regionRestriction = {
        allowed: source.regionRestrictionAllowed
          ? JSON.parse(source.regionRestrictionAllowed)
          : undefined,
        blocked: source.regionRestrictionBlocked
          ? JSON.parse(source.regionRestrictionBlocked)
          : undefined,
      }
    }

    return {
      type: source.type as 'archive.org' | 'youtube',
      url: source.url,
      id: source.sourceId,
      title: source.title,
      description: source.description ?? undefined,
      label: source.label ?? undefined,
      quality: source.quality ?? undefined,
      qualityMarks: marks.length > 0 ? marks.map(m => m.mark) : undefined,
      fileSize: source.fileSize ?? undefined,
      size: source.size ?? undefined,
      addedAt: source.addedAt,
      thumbnail: source.thumbnail ?? undefined,
      duration: source.duration ?? undefined,
      language: source.language ?? undefined,
      year: source.year ?? undefined,
      releaseYear: source.releaseYear ?? undefined,
      collection: source.collection ?? undefined,
      downloads: source.downloads ?? undefined,
      channelName: source.channelName ?? undefined,
      channelId: source.channelId ?? undefined,
      publishedAt: source.publishedAt ?? undefined,
      viewCount: source.viewCount ?? undefined,
      regionRestriction: regionRestriction ?? undefined,
    }
  })

  // Load metadata
  interface MetadataRow {
    movieId: string
    Title: string | null
    Year: string | null
    Rated: string | null
    Runtime: string | null
    Genre: string | null
    Director: string | null
    Writer: string | null
    Actors: string | null
    Plot: string | null
    Language: string | null
    Country: string | null
    Awards: string | null
    imdbRating: number | null
    imdbVotes: number | null
    imdbID: string | null
    Type: string | null
  }

  const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(movieId) as
    | MetadataRow
    | undefined

  let convertedMetadata: MovieEntry['metadata'] = undefined
  if (metadata) {
    // Load ratings
    const ratings = db
      .prepare('SELECT Source, Value FROM ratings WHERE movieId = ?')
      .all(movieId) as { Source: string; Value: string }[]

    convertedMetadata = {
      Title: metadata.Title ?? undefined,
      Year: metadata.Year ?? undefined,
      Rated: metadata.Rated ?? undefined,
      Runtime: metadata.Runtime ?? undefined,
      Genre: metadata.Genre ?? undefined,
      Director: metadata.Director ?? undefined,
      Writer: metadata.Writer ?? undefined,
      Actors: metadata.Actors ?? undefined,
      Plot: metadata.Plot ?? undefined,
      Language: metadata.Language ?? undefined,
      Country: metadata.Country ?? undefined,
      Awards: metadata.Awards ?? undefined,
      Ratings: ratings.length > 0 ? ratings : undefined,
      imdbRating: metadata.imdbRating ?? undefined,
      imdbVotes: metadata.imdbVotes ?? undefined,
      imdbID: metadata.imdbID ?? undefined,
      Type: metadata.Type ?? undefined,
    }
  }

  // Load AI metadata
  const aiMetadata = db
    .prepare('SELECT title, year FROM ai_metadata WHERE movieId = ?')
    .get(movieId) as { title: string; year: number } | undefined

  // Load collections
  const collections = db
    .prepare(
      `
      SELECT c.id, c.name 
      FROM collections c
      JOIN collection_movies cm ON c.id = cm.collectionId
      WHERE cm.movieId = ?
    `
    )
    .all(movieId) as { id: string; name: string }[]

  return {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year || undefined,
    sources: sourcesWithMarks,
    metadata: convertedMetadata,
    verified: movie.verified === 1,
    ai: aiMetadata || undefined,
    lastUpdated: movie.lastUpdated,
    collections: collections.length > 0 ? collections : undefined,
  }
}

interface EnrichmentOptions {
  limit?: number
  onlyUnmatched?: boolean
  forceRetryFailed?: boolean
}

interface EnrichmentResult {
  processed: number
  matched: number
  failed: number
  errors: string[]
}

export default defineEventHandler(async event => {
  const body = await readBody<EnrichmentOptions>(event)
  const { limit = 50, onlyUnmatched = true, forceRetryFailed = false } = body || {}

  const apiKey = process.env.OMDB_API_KEY
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message: 'OMDB_API_KEY environment variable is required',
    })
  }

  const result: EnrichmentResult = {
    processed: 0,
    matched: 0,
    failed: 0,
    errors: [],
  }

  try {
    console.log('Getting movie keys from database...')
    emitProgress({
      type: 'omdb',
      status: 'starting',
      message: 'Getting movie keys...',
      current: 0,
      total: 0,
      successCurrent: 0,
      failedCurrent: 0,
    })

    if (forceRetryFailed) {
      clearFailedOmdbMatches()
    }

    // Get database connection for reading movie data
    const db = getAdminDatabase()

    console.log('Getting unmatched...')
    emitProgress({
      type: 'omdb',
      status: 'starting',
      message: 'Getting unmatched...',
      current: 0,
      total: 0,
      successCurrent: 0,
      failedCurrent: 0,
    })

    // Get movies to process directly from SQLite
    const moviesToProcess: MovieEntry[] = []
    const targetLimit = limit || Infinity

    let count = 0
    const failed = loadFailedOmdbMatches()

    // Get movie IDs from extractMovieKeys (still uses JSON for now)
    const keys = onlyUnmatched
      ? await extractMovieKeys('unmatched', key => !failed.has(key))
      : await extractMovieKeys()

    const processingTotal = targetLimit || keys.length

    // Load movie entries from SQLite
    for (const key of keys) {
      emitProgress({
        type: 'omdb',
        status: 'starting',
        message: `Loading ${key}`,
        current: count++,
        total: processingTotal,
        successCurrent: 0,
        failedCurrent: 0,
      })
      console.log(`Loading ${key}`)

      // Check if we've reached the limit
      if (moviesToProcess.length >= targetLimit) break

      // Load movie from SQLite
      try {
        const movie = await loadMovieFromDb(db, key)
        if (movie) {
          moviesToProcess.push(movie)
        }
      } catch (error) {
        console.error(`Error loading movie ${key}:`, error)
        // Skip this movie if we can't load it
        continue
      }
    }

    const total = moviesToProcess.length

    // Emit starting progress
    emitProgress({
      type: 'omdb',
      status: 'starting',
      message: 'Starting OMDB enrichment...',
      current: 0,
      total,
      successCurrent: 0,
      failedCurrent: 0,
    })

    console.log('Starting to process movies...')

    // Process each movie
    for (const movie of moviesToProcess) {
      const oldId = movie.movieId

      emitProgress({
        type: 'omdb',
        status: 'in_progress',
        message: `${Array.isArray(movie.title) ? movie.title[0] : movie.title}`,
        current: result.processed + 1,
        total,
        successCurrent: result.matched,
        failedCurrent: result.failed,
      })

      // Validate title
      const primaryTitle = Array.isArray(movie.title) ? movie.title[0] : movie.title
      if (!primaryTitle || typeof primaryTitle !== 'string') {
        result.processed++
        result.failed++
        result.errors.push(`Invalid title for ${oldId}`)

        // Prepare AI status information for failure tracking
        const aiStatus = {
          hasAITitle: Boolean(movie.ai?.title),
          hasAIYear: Boolean(movie.ai?.year),
          aiTitleUsed: false, // AI title wasn't used due to invalid primary title
        }

        saveFailedOmdbMatch(
          oldId,
          primaryTitle || 'Unknown',
          'Invalid title',
          undefined,
          undefined,
          aiStatus
        )
        continue
      }

      // Extract year from sources
      const sourceWithYear = movie.sources.find(s => s.year || s.releaseYear)
      const sourceYear = sourceWithYear?.year || sourceWithYear?.releaseYear

      // Parse title and extract year
      const { title: name, year: titleYear } = extractYearAndCleanTitle(primaryTitle)
      const yearToUse = sourceYear || titleYear

      // Track all attempts for enhanced failure tracking
      const attempts: Array<{ query: string; year?: number }> = []

      try {
        // Try multiple cleaning strategies for better OMDB matching
        let matchResult: MatchResult = { confidence: MatchConfidence.NONE }

        // Strategy 1: Try with AI-extracted title if available (using primary source year)
        if (movie.ai?.title) {
          console.log(`[OMDB] Using AI-extracted title: "${movie.ai.title}" (year: ${yearToUse})`)
          attempts.push({ query: movie.ai.title, year: yearToUse })
          matchResult = await matchMovie(movie.ai.title, yearToUse, apiKey)
        }

        // Strategy 2: If AI title failed or not available, try with general cleaner
        if (matchResult.confidence === MatchConfidence.NONE) {
          const cleanedName = cleanTitleGeneral(name)
          console.log(`[OMDB] Using cleaned title: "${cleanedName}" (year: ${yearToUse})`)
          attempts.push({ query: cleanedName, year: yearToUse })
          matchResult = await matchMovie(cleanedName, yearToUse, apiKey)
        }

        // Strategy 3: If cleaned version failed, try original parsed title
        if (matchResult.confidence === MatchConfidence.NONE) {
          console.log(`[OMDB] Using original parsed title: "${name}" (year: ${yearToUse})`)
          attempts.push({ query: name, year: yearToUse })
          matchResult = await matchMovie(name, yearToUse, apiKey)
        }

        result.processed++

        if (matchResult.confidence === MatchConfidence.NONE) {
          result.failed++
          result.errors.push(`No match found for: ${primaryTitle}`)

          // Prepare AI status information for failure tracking
          const aiStatus = {
            hasAITitle: Boolean(movie.ai?.title),
            hasAIYear: Boolean(movie.ai?.year),
            aiTitleUsed: Boolean(movie.ai?.title), // AI title was used if it exists
          }

          saveFailedOmdbMatch(
            oldId,
            primaryTitle,
            'No OMDB match found',
            attempts,
            yearToUse,
            aiStatus
          )
          continue
        }

        // We have a match!
        const newId = matchResult.movieId!
        result.matched++

        // Remove from failed list if it was there (successful retry)
        removeFailedOmdbMatch(oldId)
        if (oldId !== newId) {
          removeFailedOmdbMatch(newId)
        }

        // Update the movie entry in SQLite
        movie.movieId = newId
        movie.title = matchResult.title!
        movie.year = matchResult.year ? parseInt(matchResult.year, 10) : undefined
        movie.metadata = matchResult.metadata

        // Migrate if ID changed, then upsert the updated entry
        if (oldId !== newId) {
          const migrationResult = await migrateMovieId(oldId, newId)
          if (!migrationResult.success) {
            throw new Error(`Migration failed: ${migrationResult.message}`)
          }
        }

        // Upsert the updated movie entry to SQLite
        await upsertMovie(newId, movie)
      } catch (error) {
        result.failed++
        result.errors.push(
          `Error processing ${movie.title}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    emitProgress({
      type: 'omdb',
      status: 'completed',
      current: result.processed,
      total: result.processed,
      message: 'OMDB enrichment completed',
      successCurrent: result.matched,
      failedCurrent: result.failed,
    })

    return result
  } catch (error) {
    emitProgress({
      type: 'omdb',
      status: 'error',
      current: 0,
      total: 0,
      message: error instanceof Error ? error.message : 'Enrichment failed',
    })
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Enrichment failed',
    })
  }
})
