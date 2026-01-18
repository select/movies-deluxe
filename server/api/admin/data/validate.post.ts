/**
 * Data Validation API Endpoint
 *
 * Validates movies.json integrity and generates a detailed report of issues.
 * Can auto-fix certain problems when fix=true is passed.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { unlink } from 'fs/promises'
import { join } from 'path'
import type { MovieEntry, MoviesDatabase } from '../../../../shared/types/movie'
import { isImdbId, isTemporaryId } from '../../../../shared/types/movie'

// Note: loadMoviesDatabase, saveMoviesDatabase, findOrphanedPosters are auto-imported

interface ValidationOptions {
  fix?: boolean
  verbose?: boolean
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  category: 'movieId' | 'title' | 'sources' | 'metadata' | 'duplicates' | 'orphaned' | 'schema'
  movieId: string
  message: string
  fixable: boolean
  fixed?: boolean
}

interface ValidationResult {
  totalMovies: number
  validMovies: number
  issues: ValidationIssue[]
  errors: number
  warnings: number
  infos: number
  fixed: number
}

/**
 * Validate IMDB ID format
 */
function validateImdbId(movieId: string, movie: MovieEntry): ValidationIssue | null {
  if (!isImdbId(movieId) && !isTemporaryId(movieId)) {
    return {
      severity: 'error',
      category: 'movieId',
      movieId,
      message: `Invalid ID format: "${movieId}". Must be IMDB ID (tt1234567) or temporary ID (archive-*, youtube-*)`,
      fixable: false,
    }
  }

  if (movie.movieId !== movieId) {
    return {
      severity: 'error',
      category: 'movieId',
      movieId,
      message: `ID mismatch: key="${movieId}" but movie.movieId="${movie.movieId}"`,
      fixable: true,
    }
  }

  return null
}

/**
 * Validate title field
 */
function validateTitle(movieId: string, movie: MovieEntry): ValidationIssue | null {
  if (!movie.title) {
    return {
      severity: 'error',
      category: 'title',
      movieId,
      message: 'Missing title field',
      fixable: false,
    }
  }

  if (typeof movie.title !== 'string') {
    return {
      severity: 'error',
      category: 'title',
      movieId,
      message: `Invalid title type: ${typeof movie.title} (expected string)`,
      fixable: false,
    }
  }

  if (movie.title.trim().length === 0) {
    return {
      severity: 'error',
      category: 'title',
      movieId,
      message: 'Empty title',
      fixable: false,
    }
  }

  if (movie.title.length > 200) {
    return {
      severity: 'warning',
      category: 'title',
      movieId,
      message: `Unusually long title (${movie.title.length} characters)`,
      fixable: false,
    }
  }

  return null
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate sources array
 */
function validateSources(movieId: string, movie: MovieEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!movie.sources) {
    issues.push({
      severity: 'error',
      category: 'sources',
      movieId,
      message: 'Missing sources array',
      fixable: false,
    })
    return issues
  }

  if (!Array.isArray(movie.sources)) {
    issues.push({
      severity: 'error',
      category: 'sources',
      movieId,
      message: `Invalid sources type: ${typeof movie.sources} (expected array)`,
      fixable: false,
    })
    return issues
  }

  if (movie.sources.length === 0) {
    issues.push({
      severity: 'warning',
      category: 'sources',
      movieId,
      message: 'No sources available',
      fixable: false,
    })
    return issues
  }

  // Validate each source
  movie.sources.forEach((source, index) => {
    if (!source.type) {
      issues.push({
        severity: 'error',
        category: 'sources',
        movieId,
        message: `Source ${index}: Missing type field`,
        fixable: false,
      })
      return
    }

    if (!source.url) {
      issues.push({
        severity: 'error',
        category: 'sources',
        movieId,
        message: `Source ${index}: Missing URL`,
        fixable: false,
      })
    } else if (!isValidUrl(source.url)) {
      issues.push({
        severity: 'error',
        category: 'sources',
        movieId,
        message: `Source ${index}: Invalid URL format`,
        fixable: false,
      })
    }

    if (!source.addedAt) {
      issues.push({
        severity: 'warning',
        category: 'sources',
        movieId,
        message: `Source ${index}: Missing addedAt timestamp`,
        fixable: false,
      })
    }

    if (source.type !== 'archive.org' && source.type !== 'youtube') {
      const sourceType =
        'type' in source ? (source as MovieSource & { type: string }).type : 'unknown'
      issues.push({
        severity: 'error',
        category: 'sources',
        movieId,
        message: `Source ${index}: Invalid type "${sourceType}"`,
        fixable: false,
      })
    }
  })

  // Check for duplicate sources
  const urls = movie.sources.map(s => s.url)
  const uniqueUrls = new Set(urls)
  if (urls.length !== uniqueUrls.size) {
    issues.push({
      severity: 'warning',
      category: 'sources',
      movieId,
      message: 'Duplicate source URLs detected',
      fixable: true,
    })
  }

  return issues
}

/**
 * Validate metadata
 */
function validateMetadata(movieId: string, movie: MovieEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (movie.metadata) {
    if (typeof movie.metadata !== 'object') {
      issues.push({
        severity: 'error',
        category: 'metadata',
        movieId,
        message: `Invalid metadata type: ${typeof movie.metadata} (expected object)`,
        fixable: false,
      })
      return issues
    }

    if (isImdbId(movieId) && Object.keys(movie.metadata).length === 0) {
      issues.push({
        severity: 'info',
        category: 'metadata',
        movieId,
        message: 'Movie has IMDB ID but no metadata (consider enriching)',
        fixable: false,
      })
    }
  } else if (isImdbId(movieId)) {
    issues.push({
      severity: 'info',
      category: 'metadata',
      movieId,
      message: 'Movie has IMDB ID but no metadata (consider enriching)',
      fixable: false,
    })
  }

  return issues
}

/**
 * Validate lastUpdated timestamp
 */
function validateTimestamp(movieId: string, movie: MovieEntry): ValidationIssue | null {
  if (!movie.lastUpdated) {
    return {
      severity: 'warning',
      category: 'schema',
      movieId,
      message: 'Missing lastUpdated timestamp',
      fixable: true,
    }
  }

  try {
    const date = new Date(movie.lastUpdated)
    if (isNaN(date.getTime())) {
      return {
        severity: 'error',
        category: 'schema',
        movieId,
        message: `Invalid lastUpdated timestamp: "${movie.lastUpdated}"`,
        fixable: true,
      }
    }
  } catch {
    return {
      severity: 'error',
      category: 'schema',
      movieId,
      message: `Invalid lastUpdated timestamp: "${movie.lastUpdated}"`,
      fixable: true,
    }
  }

  return null
}

/**
 * Find duplicate movies by title similarity
 */
function findDuplicates(db: MoviesDatabase): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const movies = Object.entries(db).filter(([key]) => !key.startsWith('_')) as [
    string,
    MovieEntry,
  ][]

  const titleGroups = new Map<string, string[]>()

  for (const [id, movie] of movies) {
    if (!movie.title || typeof movie.title !== 'string') {
      continue
    }
    const normalizedTitle = movie.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim()

    if (!titleGroups.has(normalizedTitle)) {
      titleGroups.set(normalizedTitle, [])
    }
    titleGroups.get(normalizedTitle)!.push(id)
  }

  for (const [title, ids] of titleGroups) {
    if (ids.length > 1) {
      const movies = ids.map(id => db[id] as MovieEntry)
      const years = new Set(movies.map(m => m.year).filter(Boolean))

      if (years.size === 1 || years.size === 0) {
        const firstId = ids[0]
        const firstMovie = firstId ? db[firstId] : undefined
        const firstTitle =
          firstMovie && typeof firstMovie === 'object' && 'title' in firstMovie
            ? firstMovie.title
            : title
        issues.push({
          severity: 'warning',
          category: 'duplicates',
          movieId: firstId || '',
          message: `Potential duplicate movies: ${ids.join(', ')} (title: "${firstTitle}")`,
          fixable: false,
        })
      } else {
        const firstId = ids[0]
        issues.push({
          severity: 'info',
          category: 'duplicates',
          movieId: firstId || '',
          message: `Similar titles with different years: ${ids.join(', ')} (might be remakes)`,
          fixable: false,
        })
      }
    }
  }

  return issues
}

/**
 * Find orphaned temporary IDs
 */
function findOrphanedTempIds(db: MoviesDatabase): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const movies = Object.entries(db).filter(([key]) => !key.startsWith('_')) as [
    string,
    MovieEntry,
  ][]

  for (const [id, movie] of movies) {
    if (isTemporaryId(id)) {
      const lastUpdated = new Date(movie.lastUpdated)
      const daysSinceUpdate = Math.floor(
        (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysSinceUpdate > 30) {
        issues.push({
          severity: 'warning',
          category: 'orphaned',
          movieId: id,
          message: `Temporary ID not matched for ${daysSinceUpdate} days (consider manual review)`,
          fixable: false,
        })
      } else if (daysSinceUpdate > 7) {
        issues.push({
          severity: 'info',
          category: 'orphaned',
          movieId: id,
          message: `Temporary ID not matched for ${daysSinceUpdate} days`,
          fixable: false,
        })
      }
    }
  }

  return issues
}

/**
 * Fix issues where possible
 */
function fixIssue(db: MoviesDatabase, issue: ValidationIssue): boolean {
  const movie = db[issue.movieId] as MovieEntry
  if (!movie) return false

  try {
    // Fix ID mismatch
    if (issue.category === 'movieId' && issue.message.includes('ID mismatch')) {
      movie.movieId = issue.movieId
      issue.fixed = true
      return true
    }

    // Fix missing timestamp
    if (issue.category === 'schema' && issue.message.includes('lastUpdated')) {
      movie.lastUpdated = new Date().toISOString()
      issue.fixed = true
      return true
    }

    // Fix duplicate sources
    if (issue.category === 'sources' && issue.message.includes('Duplicate source URLs')) {
      const uniqueSources = Array.from(new Map(movie.sources.map(s => [s.url, s])).values())
      movie.sources = uniqueSources
      issue.fixed = true
      return true
    }

    return false
  } catch (error) {
    console.error(`Failed to fix issue for ${issue.movieId}:`, error)
    return false
  }
}

export default defineEventHandler(async event => {
  const body = await readBody<ValidationOptions>(event)
  const { fix = false, verbose = false } = body || {}

  try {
    const db = await loadMoviesDatabase()

    const result: ValidationResult = {
      totalMovies: 0,
      validMovies: 0,
      issues: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      fixed: 0,
    }

    // Get all movie entries
    const movies = Object.entries(db).filter(([key]) => !key.startsWith('_')) as [
      string,
      MovieEntry,
    ][]

    result.totalMovies = movies.length

    // Validate each movie
    for (const [id, movie] of movies) {
      const movieIssues: ValidationIssue[] = []

      // Validate IMDB ID
      const idIssue = validateImdbId(id, movie)
      if (idIssue) movieIssues.push(idIssue)

      // Validate title
      const titleIssue = validateTitle(id, movie)
      if (titleIssue) movieIssues.push(titleIssue)

      // Validate sources
      movieIssues.push(...validateSources(id, movie))

      // Validate metadata
      if (verbose) {
        movieIssues.push(...validateMetadata(id, movie))
      }

      // Validate timestamp
      const timestampIssue = validateTimestamp(id, movie)
      if (timestampIssue) movieIssues.push(timestampIssue)

      result.issues.push(...movieIssues)

      if (movieIssues.length === 0) {
        result.validMovies++
      }
    }

    // Find duplicates
    result.issues.push(...findDuplicates(db))

    // Find orphaned temporary IDs
    if (verbose) {
      result.issues.push(...findOrphanedTempIds(db))
    }

    // Find orphaned posters
    const orphanedPosters = await findOrphanedPosters(db)
    for (const poster of orphanedPosters) {
      result.issues.push({
        severity: 'warning',
        category: 'orphaned',
        movieId: 'N/A',
        message: `Orphaned poster file: ${poster}`,
        fixable: true,
      })
    }

    // Count by severity
    result.errors = result.issues.filter(i => i.severity === 'error').length
    result.warnings = result.issues.filter(i => i.severity === 'warning').length
    result.infos = result.issues.filter(i => i.severity === 'info').length

    // Fix issues if requested
    if (fix) {
      for (const issue of result.issues) {
        if (issue.fixable) {
          // Handle orphaned posters
          if (issue.category === 'orphaned' && issue.message.includes('Orphaned poster')) {
            try {
              const filename = issue.message.replace('Orphaned poster file: ', '')
              const posterPath = join(process.cwd(), 'public/posters', filename)
              await unlink(posterPath)
              issue.fixed = true
              result.fixed++
            } catch (error) {
              console.error(`Failed to delete orphaned poster: ${error}`)
            }
          } else if (fixIssue(db, issue)) {
            result.fixed++
          }
        }
      }

      if (result.fixed > 0) {
        await saveMoviesDatabase(db)
      }
    }

    return result
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Validation failed',
    })
  }
})
