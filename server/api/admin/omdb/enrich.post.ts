/**
 * OMDB Enrichment API Endpoint
 *
 * Enriches movies with OMDB metadata by matching unmatched movies
 * or re-enriching existing movies.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import type { MovieEntry, ArchiveOrgSource, YouTubeSource } from '../../../../shared/types/movie'

// Note: The following functions are auto-imported from server/utils/:
// - loadMoviesDatabase, saveMoviesDatabase, getUnmatchedMovies, migrateMovieId,
//   hasFailedOmdbMatch, markFailedOmdbMatch, clearFailedOmdbMatches (from movieData.ts)
// - matchMovie (from omdb.ts)
// - emitProgress (from progress.ts)

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

/**
 * Parse title to extract movie name and year
 */
function parseTitle(title: string): { name: string; year?: number } {
  // Try to extract year from title like "Movie Name (1999)"
  const match = title.match(/^(.+?)\s*\((\d{4})\)/)
  if (match && match[1] && match[2]) {
    return {
      name: match[1].trim(),
      year: parseInt(match[2], 10),
    }
  }
  return { name: title }
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
    // Load movies database
    const db = await loadMoviesDatabase()

    if (forceRetryFailed) {
      clearFailedOmdbMatches(db)
    }

    // Get movies to process
    let moviesToProcess = onlyUnmatched
      ? getUnmatchedMovies(db)
      : Object.values(db).filter(
          (entry): entry is MovieEntry =>
            typeof entry === 'object' && entry !== null && 'imdbId' in entry
        )

    // Filter out previously failed matches unless forced
    if (!forceRetryFailed) {
      moviesToProcess = moviesToProcess.filter(movie => !hasFailedOmdbMatch(db, movie.imdbId))
    }

    // Apply limit
    if (limit) {
      moviesToProcess = moviesToProcess.slice(0, limit)
    }

    const total = moviesToProcess.length

    // Process each movie
    for (const movie of moviesToProcess) {
      const oldId = movie.imdbId

      emitProgress({
        type: 'omdb',
        status: 'in_progress',
        message: `Enriching: ${movie.title}`,
        current: result.processed,
        total,
      })

      // Validate title
      if (!movie.title || typeof movie.title !== 'string') {
        result.processed++
        result.failed++
        result.errors.push(`Invalid title for ${oldId}`)
        markFailedOmdbMatch(db, oldId)
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

      // Prioritize AI-extracted title if available
      const titleToUse = movie.ai?.extractedTitle || movie.title
      const usingAiTitle = !!movie.ai?.extractedTitle

      // Parse title
      const { name, year: titleYear } = parseTitle(titleToUse)
      const yearToUse = sourceYear || titleYear

      try {
        // Attempt to match with OMDB
        let matchResult = await matchMovie(name, yearToUse, apiKey)

        // If AI title didn't match and we have a fallback, try original title
        if (matchResult.confidence === 'none' && usingAiTitle) {
          const { name: originalName, year: originalYear } = parseTitle(movie.title)
          const originalYearToUse = sourceYear || originalYear
          matchResult = await matchMovie(originalName, originalYearToUse, apiKey)
        }

        result.processed++

        if (matchResult.confidence === 'none') {
          result.failed++
          result.errors.push(`No match found for: ${movie.title}`)
          markFailedOmdbMatch(db, oldId)
          await saveMoviesDatabase(db)
          continue
        }

        // We have a match!
        const newId = matchResult.imdbId!
        result.matched++

        // Update the movie entry
        movie.imdbId = newId
        movie.title = matchResult.title!
        movie.year = matchResult.year ? parseInt(matchResult.year, 10) : undefined
        movie.metadata = matchResult.metadata

        // Migrate if ID changed
        if (oldId !== newId) {
          migrateMovieId(db, oldId, newId)
        }

        // Save progress after each successful match
        await saveMoviesDatabase(db)
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
