/**
 * OMDB Enrichment API Endpoint
 *
 * Enriches movies with OMDB metadata by matching unmatched movies
 * or re-enriching existing movies.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import {
  loadMoviesDatabase,
  saveMoviesDatabase,
  getUnmatchedMovies,
  migrateMovieId,
} from '../../../../scripts/utils/dataManager'
import { matchMovie } from '../../../../scripts/utils/omdbMatcher'
import type { MovieEntry } from '../../../../shared/types/movie'

interface EnrichmentOptions {
  limit?: number
  onlyUnmatched?: boolean
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
  if (match) {
    return {
      name: match[1].trim(),
      year: parseInt(match[2], 10),
    }
  }
  return { name: title }
}

export default defineEventHandler(async event => {
  const body = await readBody<EnrichmentOptions>(event)
  const { limit = 50, onlyUnmatched = true } = body || {}

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

    // Get movies to process
    let moviesToProcess = onlyUnmatched
      ? getUnmatchedMovies(db)
      : Object.values(db).filter(
          (entry): entry is MovieEntry =>
            typeof entry === 'object' && entry !== null && 'imdbId' in entry
        )

    // Apply limit
    if (limit) {
      moviesToProcess = moviesToProcess.slice(0, limit)
    }

    // Process each movie
    for (const movie of moviesToProcess) {
      const oldId = movie.imdbId

      // Validate title
      if (!movie.title || typeof movie.title !== 'string') {
        result.processed++
        result.failed++
        result.errors.push(`Invalid title for ${oldId}`)
        continue
      }

      // Extract year from sources
      const archiveSource = movie.sources.find((s: any) => s.type === 'archive.org')
      const youtubeSource = movie.sources.find((s: any) => s.type === 'youtube')

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

    return result
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Enrichment failed',
    })
  }
})
