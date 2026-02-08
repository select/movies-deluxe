/**
 * Data Validation API Endpoint
 *
 * Validates database integrity and generates a detailed report of issues.
 * Can auto-fix certain problems when fix=true is passed.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { unlink, readdir } from 'fs/promises'
import { join } from 'path'
import type { MovieEntry, MovieSource } from '../../../../shared/types/movie'
import { isImdbId, isTemporaryId } from '../../../../shared/types/movie'
import { getAdminDatabase, withTransaction } from '../../../utils/adminDb'
import type Database from 'better-sqlite3'

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

    if (!source.sourceId) {
      issues.push({
        severity: 'error',
        category: 'sources',
        movieId,
        message: `Source ${index}: Missing sourceId`,
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

  // Check for duplicate sources (by type + sourceId)
  const sourceKeys = movie.sources.map(s => `${s.type}:${s.sourceId}`)
  const uniqueKeys = new Set(sourceKeys)
  if (sourceKeys.length !== uniqueKeys.size) {
    issues.push({
      severity: 'warning',
      category: 'sources',
      movieId,
      message: 'Duplicate sources detected (same type + sourceId)',
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
function findDuplicates(db: Database.Database): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Load all movies
  const movies = db
    .prepare('SELECT movieId, title, year FROM movies ORDER BY movieId')
    .all() as Array<{ movieId: string; title: string; year: number | null }>

  const titleGroups = new Map<string, Array<{ id: string; year: number | null }>>()

  for (const movie of movies) {
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
    titleGroups.get(normalizedTitle)!.push({ id: movie.movieId, year: movie.year })
  }

  for (const [title, entries] of titleGroups) {
    if (entries.length > 1) {
      const years = new Set(entries.map(e => e.year).filter(Boolean))
      const ids = entries.map(e => e.id)

      if (years.size === 1 || years.size === 0) {
        const firstEntry = entries[0]
        const firstMovie = db
          .prepare('SELECT title FROM movies WHERE movieId = ?')
          .get(firstEntry?.id) as { title: string } | undefined
        const firstTitle = firstMovie?.title || title

        issues.push({
          severity: 'warning',
          category: 'duplicates',
          movieId: firstEntry?.id || '',
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
function findOrphanedTempIds(db: Database.Database): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const movies = db
    .prepare('SELECT movieId, lastUpdated FROM movies WHERE movieId NOT LIKE "tt%"')
    .all() as Array<{ movieId: string; lastUpdated: string }>

  for (const movie of movies) {
    if (isTemporaryId(movie.movieId)) {
      const lastUpdated = new Date(movie.lastUpdated)
      const daysSinceUpdate = Math.floor(
        (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysSinceUpdate > 30) {
        issues.push({
          severity: 'warning',
          category: 'orphaned',
          movieId: movie.movieId,
          message: `Temporary ID not matched for ${daysSinceUpdate} days (consider manual review)`,
          fixable: false,
        })
      } else if (daysSinceUpdate > 7) {
        issues.push({
          severity: 'info',
          category: 'orphaned',
          movieId: movie.movieId,
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
async function fixIssue(db: Database.Database, issue: ValidationIssue): Promise<boolean> {
  const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(issue.movieId) as
    | { movieId: string; title: string; year: number | null; verified: number; lastUpdated: string }
    | undefined

  if (!movie) return false

  try {
    // Fix ID mismatch
    if (issue.category === 'movieId' && issue.message.includes('ID mismatch')) {
      const oldId = movie.movieId
      // Update the movie record
      db.prepare('UPDATE movies SET movieId = ? WHERE movieId = ?').run(issue.movieId, oldId)
      // Update all related tables
      db.prepare('UPDATE sources SET movieId = ? WHERE movieId = ?').run(issue.movieId, oldId)
      db.prepare('UPDATE metadata SET movieId = ? WHERE movieId = ?').run(issue.movieId, oldId)
      db.prepare('UPDATE ai_metadata SET movieId = ? WHERE movieId = ?').run(issue.movieId, oldId)
      db.prepare('UPDATE related_movies SET movieId = ? WHERE movieId = ?').run(
        issue.movieId,
        oldId
      )
      db.prepare('UPDATE related_movies SET relatedMovieId = ? WHERE relatedMovieId = ?').run(
        issue.movieId,
        oldId
      )
      // Update collections
      db.prepare('UPDATE collection_movies SET movieId = ? WHERE movieId = ?').run(
        issue.movieId,
        oldId
      )
      issue.fixed = true
      return true
    }

    // Fix missing timestamp
    if (issue.category === 'schema' && issue.message.includes('lastUpdated')) {
      db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?').run(
        new Date().toISOString(),
        issue.movieId
      )
      issue.fixed = true
      return true
    }

    // Fix duplicate sources
    if (issue.category === 'sources' && issue.message.includes('Duplicate sources')) {
      // Get all sources for this movie
      const sources = db
        .prepare('SELECT id, sourceId, channelId FROM sources WHERE movieId = ?')
        .all(issue.movieId) as Array<{ id: number; sourceId: string; channelId: string }>

      // Track unique sources by channelId:sourceId
      const seen = new Set<string>()
      const toDelete: number[] = []

      for (const source of sources) {
        const key = `${source.channelId}:${source.sourceId}`
        if (seen.has(key)) {
          toDelete.push(source.id)
        } else {
          seen.add(key)
        }
      }

      // Delete duplicate sources
      for (const id of toDelete) {
        // Delete quality marks first
        db.prepare('DELETE FROM source_quality_marks WHERE sourceId = ?').run(id)
        // Delete source
        db.prepare('DELETE FROM sources WHERE id = ?').run(id)
      }

      issue.fixed = true
      return true
    }

    return false
  } catch (error) {
    console.error(`Failed to fix issue for ${issue.movieId}:`, error)
    return false
  }
}

/**
 * Find orphaned poster files (files not referenced by any movie)
 */
async function findOrphanedPosters(db: Database.Database): Promise<string[]> {
  try {
    const postersDir = join(process.cwd(), 'public/posters')

    // Get all poster files
    const files = await readdir(postersDir)

    // Get all movie IDs that should have posters (IMDB IDs)
    const expectedPosters = new Set<string>()
    const movies = db
      .prepare('SELECT movieId FROM movies WHERE movieId LIKE "tt%"')
      .all() as Array<{ movieId: string }>

    for (const movie of movies) {
      expectedPosters.add(`${movie.movieId}.jpg`)
    }

    // Find files not expected (orphaned posters)
    const orphaned: string[] = []
    for (const file of files) {
      if (file === '.gitkeep') continue
      if (!expectedPosters.has(file)) {
        orphaned.push(file)
      }
    }

    return orphaned
  } catch (error: unknown) {
    // Directory doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    console.error('Failed to find orphaned posters:', error)
    return []
  }
}

/**
 * Load movie entry from database for validation
 */
function loadMovieForValidation(
  db: Database.Database,
  movieId: string
): { movie: MovieEntry; sources: MovieSource[] } | null {
  const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId) as
    | { movieId: string; title: string; year: number | null; verified: number; lastUpdated: string }
    | undefined

  if (!movie) return null

  // Load sources
  const sources = db
    .prepare(
      `
      SELECT s.*, c.platform as type
      FROM sources s
      JOIN channels c ON s.channelId = c.id
      WHERE s.movieId = ?
    `
    )
    .all(movieId) as Array<{
    id: number
    sourceId: string
    channelId: string
    type: string
    title: string | null
    addedAt: number
  }>

  const movieEntry: MovieEntry = {
    movieId: movie.movieId,
    title: movie.title,
    year: movie.year || undefined,
    sources: sources.map(s => ({
      id: s.sourceId,
      sourceId: s.sourceId,
      channelId: s.channelId,
      type: s.type as 'archive.org' | 'youtube',
      title: s.title || undefined,
      addedAt: s.addedAt,
      channelName: '',
    })),
    verified: movie.verified === 1,
    lastUpdated: movie.lastUpdated,
  }

  // Load metadata if exists
  const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(movieId)
  if (metadata) {
    movieEntry.metadata = metadata as MovieEntry['metadata']
  }

  return { movie: movieEntry, sources: movieEntry.sources }
}

export default defineEventHandler(async event => {
  const body = await readBody<ValidationOptions>(event)
  const { fix = false, verbose = false } = body || {}

  try {
    const db = getAdminDatabase()

    const result: ValidationResult = {
      totalMovies: 0,
      validMovies: 0,
      issues: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      fixed: 0,
    }

    // Get all movie IDs
    const movieIds = db
      .prepare('SELECT movieId FROM movies ORDER BY movieId')
      .all() as Array<{ movieId: string }>

    result.totalMovies = movieIds.length

    // Validate each movie
    for (const { movieId } of movieIds) {
      const movieData = loadMovieForValidation(db, movieId)
      if (!movieData) continue

      const { movie } = movieData
      const movieIssues: ValidationIssue[] = []

      // Validate IMDB ID
      const idIssue = validateImdbId(movieId, movie)
      if (idIssue) movieIssues.push(idIssue)

      // Validate title
      const titleIssue = validateTitle(movieId, movie)
      if (titleIssue) movieIssues.push(titleIssue)

      // Validate sources
      movieIssues.push(...validateSources(movieId, movie))

      // Validate metadata
      if (verbose) {
        movieIssues.push(...validateMetadata(movieId, movie))
      }

      // Validate timestamp
      const timestampIssue = validateTimestamp(movieId, movie)
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
      // Use transaction for fixing issues
      await withTransaction(async txDb => {
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
            } else if (await fixIssue(txDb, issue)) {
              result.fixed++
            }
          }
        }
      })
    }

    return result
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Validation failed',
    })
  }
})
