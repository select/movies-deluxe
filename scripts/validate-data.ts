/**
 * Data Validation Script
 *
 * Validates movies.json integrity and generates a detailed report of issues.
 * Can auto-fix certain problems when --fix flag is used.
 *
 * Usage:
 *   npm run validate:data
 *   npm run validate:data -- --fix
 *   npm run validate:data -- --verbose
 */

import { parseArgs } from 'util'
import { loadMoviesDatabase, saveMoviesDatabase, getDatabaseStats } from './utils/dataManager.ts'
import { createLogger } from './utils/logger.ts'
import type { MoviesDatabase, MovieEntry, ArchiveOrgSource, YouTubeSource } from '../types/movie.ts'
import { isImdbId, isTemporaryId } from '../types/movie.ts'

const logger = createLogger('ValidateData')

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  category: 'imdbId' | 'title' | 'sources' | 'metadata' | 'duplicates' | 'orphaned' | 'schema'
  movieId: string
  message: string
  fixable: boolean
  fixed?: boolean
}

interface ValidationReport {
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
  // Check if it's a valid IMDB ID or temporary ID
  if (!isImdbId(movieId) && !isTemporaryId(movieId)) {
    return {
      severity: 'error',
      category: 'imdbId',
      movieId,
      message: `Invalid ID format: "${movieId}". Must be IMDB ID (tt1234567) or temporary ID (archive-*, youtube-*)`,
      fixable: false,
    }
  }

  // Check if movie.imdbId matches the key
  if (movie.imdbId !== movieId) {
    return {
      severity: 'error',
      category: 'imdbId',
      movieId,
      message: `ID mismatch: key="${movieId}" but movie.imdbId="${movie.imdbId}"`,
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

  // Check for suspicious titles
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
 * Validate Archive.org source
 */
function validateArchiveSource(
  movieId: string,
  source: ArchiveOrgSource,
  index: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!source.identifier) {
    issues.push({
      severity: 'error',
      category: 'sources',
      movieId,
      message: `Source ${index}: Missing Archive.org identifier`,
      fixable: false,
    })
  }

  if (!source.url || !isValidUrl(source.url)) {
    issues.push({
      severity: 'error',
      category: 'sources',
      movieId,
      message: `Source ${index}: Invalid or missing URL`,
      fixable: false,
    })
  } else if (!source.url.includes('archive.org')) {
    issues.push({
      severity: 'warning',
      category: 'sources',
      movieId,
      message: `Source ${index}: URL doesn't contain 'archive.org'`,
      fixable: false,
    })
  }

  return issues
}

/**
 * Validate YouTube source
 */
function validateYouTubeSource(
  movieId: string,
  source: YouTubeSource,
  index: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!source.videoId) {
    issues.push({
      severity: 'error',
      category: 'sources',
      movieId,
      message: `Source ${index}: Missing YouTube videoId`,
      fixable: false,
    })
  }

  if (!source.channelName) {
    issues.push({
      severity: 'warning',
      category: 'sources',
      movieId,
      message: `Source ${index}: Missing YouTube channelName`,
      fixable: false,
    })
  }

  if (!source.url || !isValidUrl(source.url)) {
    issues.push({
      severity: 'error',
      category: 'sources',
      movieId,
      message: `Source ${index}: Invalid or missing URL`,
      fixable: false,
    })
  } else if (!source.url.includes('youtube.com') && !source.url.includes('youtu.be')) {
    issues.push({
      severity: 'warning',
      category: 'sources',
      movieId,
      message: `Source ${index}: URL doesn't contain 'youtube.com' or 'youtu.be'`,
      fixable: false,
    })
  }

  return issues
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

    // Type-specific validation
    if (source.type === 'archive.org') {
      issues.push(...validateArchiveSource(movieId, source as ArchiveOrgSource, index))
    } else if (source.type === 'youtube') {
      issues.push(...validateYouTubeSource(movieId, source as YouTubeSource, index))
    } else {
      issues.push({
        severity: 'error',
        category: 'sources',
        movieId,
        message: `Source ${index}: Invalid type "${source.type}"`,
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

  // Metadata is optional, but if present should be valid
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

    // Check if IMDB ID movie has metadata
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

  // Try to parse as ISO 8601
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

  // Group by normalized title
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

  // Report duplicates
  for (const [title, ids] of titleGroups) {
    if (ids.length > 1) {
      // Check if they have different years
      const movies = ids.map(id => db[id] as MovieEntry)
      const years = new Set(movies.map(m => m.year).filter(Boolean))

      if (years.size === 1 || years.size === 0) {
        // Same year or no year info - likely duplicates
        issues.push({
          severity: 'warning',
          category: 'duplicates',
          movieId: ids[0],
          message: `Potential duplicate movies: ${ids.join(', ')} (title: "${title}")`,
          fixable: false,
        })
      } else {
        // Different years - might be remakes
        issues.push({
          severity: 'info',
          category: 'duplicates',
          movieId: ids[0],
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
      // Check if this temporary ID has been around for a long time
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
    if (issue.category === 'imdbId' && issue.message.includes('ID mismatch')) {
      movie.imdbId = issue.movieId
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
    logger.error(`Failed to fix issue for ${issue.movieId}:`, error)
    return false
  }
}

/**
 * Validate entire database
 */
async function validateDatabase(fix: boolean = false): Promise<ValidationReport> {
  logger.info('Loading movies database...')
  const db = await loadMoviesDatabase()

  const report: ValidationReport = {
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

  report.totalMovies = movies.length
  logger.info(`Validating ${report.totalMovies} movies...`)

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
    movieIssues.push(...validateMetadata(id, movie))

    // Validate timestamp
    const timestampIssue = validateTimestamp(id, movie)
    if (timestampIssue) movieIssues.push(timestampIssue)

    // Add to report
    report.issues.push(...movieIssues)

    if (movieIssues.length === 0) {
      report.validMovies++
    }
  }

  // Find duplicates
  report.issues.push(...findDuplicates(db))

  // Find orphaned temporary IDs
  report.issues.push(...findOrphanedTempIds(db))

  // Count by severity
  report.errors = report.issues.filter(i => i.severity === 'error').length
  report.warnings = report.issues.filter(i => i.severity === 'warning').length
  report.infos = report.issues.filter(i => i.severity === 'info').length

  // Fix issues if requested
  if (fix) {
    logger.info('Attempting to fix issues...')
    for (const issue of report.issues) {
      if (issue.fixable && fixIssue(db, issue)) {
        report.fixed++
      }
    }

    if (report.fixed > 0) {
      logger.info(`Saving fixes to database...`)
      await saveMoviesDatabase(db)
      logger.success(`Fixed ${report.fixed} issues`)
    }
  }

  return report
}

/**
 * Print validation report
 */
function printReport(report: ValidationReport, verbose: boolean): void {
  logger.info('\n' + '='.repeat(60))
  logger.info('VALIDATION REPORT')
  logger.info('='.repeat(60))

  logger.info(`\nTotal movies:  ${report.totalMovies}`)
  logger.success(`Valid movies:  ${report.validMovies}`)
  logger.error(`Errors:        ${report.errors}`)
  logger.warn(`Warnings:      ${report.warnings}`)
  logger.info(`Info:          ${report.infos}`)

  if (report.fixed > 0) {
    logger.success(`Fixed:         ${report.fixed}`)
  }

  // Group issues by category
  const byCategory = new Map<string, ValidationIssue[]>()
  for (const issue of report.issues) {
    if (!byCategory.has(issue.category)) {
      byCategory.set(issue.category, [])
    }
    byCategory.get(issue.category)!.push(issue)
  }

  // Print issues by category
  for (const [category, issues] of byCategory) {
    logger.info('\n' + '-'.repeat(60))
    logger.info(`${category.toUpperCase()} (${issues.length} issues)`)
    logger.info('-'.repeat(60))

    // Group by severity
    const errors = issues.filter(i => i.severity === 'error')
    const warnings = issues.filter(i => i.severity === 'warning')
    const infos = issues.filter(i => i.severity === 'info')

    // Print errors
    if (errors.length > 0) {
      logger.error(`\nErrors (${errors.length}):`)
      for (const issue of errors.slice(0, verbose ? errors.length : 10)) {
        logger.error(`  ${issue.movieId}: ${issue.message}`)
        if (issue.fixed) logger.success(`    ✓ Fixed`)
      }
      if (!verbose && errors.length > 10) {
        logger.error(`  ... and ${errors.length - 10} more`)
      }
    }

    // Print warnings
    if (warnings.length > 0) {
      logger.warn(`\nWarnings (${warnings.length}):`)
      for (const issue of warnings.slice(0, verbose ? warnings.length : 10)) {
        logger.warn(`  ${issue.movieId}: ${issue.message}`)
        if (issue.fixed) logger.success(`    ✓ Fixed`)
      }
      if (!verbose && warnings.length > 10) {
        logger.warn(`  ... and ${warnings.length - 10} more`)
      }
    }

    // Print infos (only in verbose mode)
    if (verbose && infos.length > 0) {
      logger.info(`\nInfo (${infos.length}):`)
      for (const issue of infos) {
        logger.info(`  ${issue.movieId}: ${issue.message}`)
      }
    }
  }

  logger.info('\n' + '='.repeat(60))

  // Summary
  if (report.errors === 0 && report.warnings === 0) {
    logger.success('\n✓ All movies passed validation!')
  } else if (report.errors === 0) {
    logger.warn(`\n⚠ Validation completed with ${report.warnings} warnings`)
  } else {
    logger.error(
      `\n✗ Validation failed with ${report.errors} errors and ${report.warnings} warnings`
    )
  }

  if (!verbose && report.infos > 0) {
    logger.info(`\nRun with --verbose to see ${report.infos} info messages`)
  }
}

/**
 * Main function
 */
async function main() {
  const { values } = parseArgs({
    options: {
      fix: {
        type: 'boolean',
        default: false,
        description: 'Attempt to auto-fix issues where possible',
      },
      verbose: {
        type: 'boolean',
        default: false,
        description: 'Show all issues including info messages',
      },
      stats: {
        type: 'boolean',
        default: false,
        description: 'Show database statistics and exit',
      },
    },
  })

  // Show stats if requested
  if (values.stats) {
    const db = await loadMoviesDatabase()
    const stats = getDatabaseStats(db)

    logger.info('\n' + '='.repeat(60))
    logger.info('DATABASE STATISTICS')
    logger.info('='.repeat(60))
    logger.info(`Total movies:        ${stats.total}`)
    logger.success(`Matched (IMDB IDs):  ${stats.matched}`)
    logger.warn(`Unmatched (temp IDs): ${stats.unmatched}`)
    logger.info(`Archive.org sources: ${stats.archiveOrgSources}`)
    logger.info(`YouTube sources:     ${stats.youtubeSources}`)
    logger.info('='.repeat(60) + '\n')
    return
  }

  logger.info('Starting data validation...')

  if (values.fix) {
    logger.warn('Fix mode enabled - issues will be auto-corrected where possible')
  }

  try {
    const report = await validateDatabase(values.fix as boolean)
    printReport(report, values.verbose as boolean)

    // Exit with error code if there are errors
    if (report.errors > 0) {
      process.exit(1)
    }
  } catch (error) {
    logger.error('Validation failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
