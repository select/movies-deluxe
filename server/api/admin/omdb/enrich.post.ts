/**
 * OMDB Enrichment API Endpoint
 *
 * Enriches movies with OMDB metadata by matching unmatched movies
 * or re-enriching existing movies.
 */

// Note: The following functions are auto-imported from server/utils/:
// - loadMoviesDatabase, saveMoviesDatabase, getUnmatchedMovies, migrateMovieId (from movieData.ts)
// - hasFailedOmdbMatch, saveFailedOmdbMatch, clearFailedOmdbMatches, removeFailedOmdbMatch (from failedOmdb.ts)
// - matchMovie (from omdb.ts)
// - emitProgress (from progress.ts)
// - cleanTitleGeneral, extractYearAndCleanTitle (from titleCleaner.ts)

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
    console.log('Loading database...')
    emitProgress({
      type: 'omdb',
      status: 'starting',
      message: 'Loading database...',
      current: 0,
      total: 0,
      successCurrent: 0,
      failedCurrent: 0,
    })
    // Load movies database
    const db = await loadMoviesDatabase()

    if (forceRetryFailed) {
      clearFailedOmdbMatches()
    }
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

    // Get movies to process - optimized to stop early when limit is reached
    const moviesToProcess: MovieEntry[] = []
    const targetLimit = limit || Infinity

    let count = 0
    const failed = loadFailedOmdbMatches()

    const keys = onlyUnmatched
      ? await extractMovieKeys('unmatched', key => !failed.has(key))
      : await extractMovieKeys()
    const processingTotal = targetLimit || keys.length
    for (const key of keys) {
      const value = db[key] as MovieEntry
      emitProgress({
        type: 'omdb',
        status: 'starting',
        message: `Processing ${key}`,
        current: count++,
        total: processingTotal,
        successCurrent: 0,
        failedCurrent: 0,
      })
      console.log(`Processing ${key}`)

      // Check if we've reached the limit
      if (moviesToProcess.length >= targetLimit) break

      // Validate it's a movie entry
      if (typeof value !== 'object' || value === null || !('imdbId' in value)) continue

      const entry = value as MovieEntry

      moviesToProcess.push(entry)
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
      const oldId = movie.imdbId

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
        saveFailedOmdbMatch(oldId, primaryTitle || 'Unknown', 'Invalid title')
        continue
      }

      // Extract year from sources
      const archiveSource = movie.sources.find(
        (s): s is ArchiveOrgSource => s.type === 'archive.org'
      )
      const youtubeSource = movie.sources.find((s): s is YouTubeSource => s.type === 'youtube')

      const archiveYear = archiveSource?.releaseDate
        ? new Date(archiveSource.releaseDate).getFullYear()
        : undefined

      const youtubeYear = youtubeSource?.releaseYear

      const sourceYear = archiveYear || youtubeYear

      // Parse title and extract year
      const { title: name, year: titleYear } = extractYearAndCleanTitle(primaryTitle)
      const yearToUse = sourceYear || titleYear

      // Track all attempts for enhanced failure tracking
      const attempts: Array<{ query: string; year?: number }> = []

      try {
        // Try multiple cleaning strategies for better OMDB matching
        let matchResult: MatchResult = { confidence: MatchConfidence.NONE }

        // Strategy 1: Try with general cleaner (handles Archive.org, foreign titles, etc.)
        const cleanedName = cleanTitleGeneral(name)
        attempts.push({ query: cleanedName, year: yearToUse })
        matchResult = await matchMovie(cleanedName, yearToUse, apiKey)

        // Strategy 2: If cleaned version failed, try original parsed title
        if (matchResult.confidence === MatchConfidence.NONE) {
          attempts.push({ query: name, year: yearToUse })
          matchResult = await matchMovie(name, yearToUse, apiKey)
        }

        result.processed++

        if (matchResult.confidence === MatchConfidence.NONE) {
          result.failed++
          result.errors.push(`No match found for: ${primaryTitle}`)
          saveFailedOmdbMatch(oldId, primaryTitle, 'No OMDB match found', attempts, yearToUse)
          continue
        }

        // We have a match!
        const newId = matchResult.imdbId!
        result.matched++

        // Remove from failed list if it was there (successful retry)
        removeFailedOmdbMatch(oldId)
        if (oldId !== newId) {
          removeFailedOmdbMatch(newId)
        }

        // Update the movie entry
        movie.imdbId = newId
        movie.title = matchResult.title!
        movie.year = matchResult.year ? parseInt(matchResult.year, 10) : undefined
        movie.metadata = matchResult.metadata

        // Migrate if ID changed
        if (oldId !== newId) {
          migrateMovieId(db, oldId, newId)
        }
      } catch (error) {
        result.failed++
        result.errors.push(
          `Error processing ${movie.title}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }

      // Save progress after every 5 steps
      if (result.processed % 5 === 0) {
        await saveMoviesDatabase(db)
      }
    }

    // Save at the very end
    await saveMoviesDatabase(db)

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
