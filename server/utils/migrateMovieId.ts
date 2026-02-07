/**
 * Movie ID Migration Utility
 *
 * Handles movie ID changes in SQLite with proper foreign key updates.
 * Used when migrating temporary IDs (archive-xyz, youtube-abc) to IMDB IDs (tt1234567).
 *
 * Features:
 * - Transaction-safe atomic operations
 * - Validates ID conflicts before migration
 * - Manually updates all foreign key references
 * - Handles bidirectional related_movies relationships
 * - Clear error messages for debugging
 *
 * Tables updated:
 * - movies (primary table)
 * - sources
 * - metadata
 * - ai_metadata
 * - movie_quality_labels
 * - collection_movies
 * - related_movies (both directions)
 *
 * Note: source_quality_marks is updated via CASCADE from sources table
 * Note: ratings table removed - imdbRating in metadata is sufficient
 */

import type { Database } from 'better-sqlite3'
import { withTransaction } from './adminDb'

/**
 * Result of movie ID migration operation
 */
export interface MigrationResult {
  success: boolean
  oldId: string
  newId: string
  message: string
  tablesUpdated?: {
    movies: number
    sources: number
    metadata: number
    aiMetadata: number
    movieQualityLabels: number
    collectionMovies: number
    relatedMovies: number
  }
}

/**
 * Migrate a movie ID from oldId to newId
 *
 * This function updates the movieId across all related tables in a single transaction.
 * It validates that the oldId exists and the newId doesn't exist before proceeding.
 *
 * @param oldId - Current movie ID to migrate from
 * @param newId - New movie ID to migrate to
 * @returns Promise<MigrationResult> - Result of the migration operation
 *
 * @example
 * // Migrate temporary ID to IMDB ID
 * const result = await migrateMovieId('archive-xyz', 'tt1234567')
 * if (result.success) {
 *   console.log('Migration successful:', result.tablesUpdated)
 * }
 *
 * @example
 * // Handle conflicts
 * const result = await migrateMovieId('youtube-abc', 'tt7654321')
 * if (!result.success) {
 *   console.error('Migration failed:', result.message)
 * }
 */
export async function migrateMovieId(oldId: string, newId: string): Promise<MigrationResult> {
  // Validate input
  if (!oldId || !newId) {
    return {
      success: false,
      oldId,
      newId,
      message: 'Both oldId and newId are required',
    }
  }

  if (oldId === newId) {
    return {
      success: false,
      oldId,
      newId,
      message: 'oldId and newId cannot be the same',
    }
  }

  try {
    return await withTransaction(async (db: Database) => {
      // Step 1: Verify oldId exists
      const oldMovie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(oldId) as
        | { movieId: string }
        | undefined

      if (!oldMovie) {
        return {
          success: false,
          oldId,
          newId,
          message: `Movie with ID '${oldId}' does not exist`,
        }
      }

      // Step 2: Verify newId doesn't exist
      const newMovie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(newId) as
        | { movieId: string }
        | undefined

      if (newMovie) {
        return {
          success: false,
          oldId,
          newId,
          message: `Movie with ID '${newId}' already exists. Cannot migrate to an existing ID.`,
        }
      }

      // Step 3: Defer foreign key constraint checking until commit
      // This allows us to update child tables to reference the new ID before updating the parent
      // SQLite will validate all constraints at commit time
      db.prepare('PRAGMA defer_foreign_keys = ON').run()

      // Step 4: Update all tables in order (child tables first, then parent)
      const tablesUpdated = {
        movies: 0,
        sources: 0,
        metadata: 0,
        aiMetadata: 0,
        movieQualityLabels: 0,
        collectionMovies: 0,
        relatedMovies: 0,
      }

      // Update related_movies (both directions)
      // This table has two foreign keys to movies, so we need to update both columns
      const relatedMoviesStmt1 = db.prepare(
        'UPDATE related_movies SET movieId = ? WHERE movieId = ?'
      )
      const relatedMoviesResult1 = relatedMoviesStmt1.run(newId, oldId)
      tablesUpdated.relatedMovies += relatedMoviesResult1.changes

      const relatedMoviesStmt2 = db.prepare(
        'UPDATE related_movies SET relatedMovieId = ? WHERE relatedMovieId = ?'
      )
      const relatedMoviesResult2 = relatedMoviesStmt2.run(newId, oldId)
      tablesUpdated.relatedMovies += relatedMoviesResult2.changes

      // Update collection_movies
      const collectionMoviesStmt = db.prepare(
        'UPDATE collection_movies SET movieId = ? WHERE movieId = ?'
      )
      const collectionMoviesResult = collectionMoviesStmt.run(newId, oldId)
      tablesUpdated.collectionMovies = collectionMoviesResult.changes

      // Update movie_quality_labels
      const movieQualityLabelsStmt = db.prepare(
        'UPDATE movie_quality_labels SET movieId = ? WHERE movieId = ?'
      )
      const movieQualityLabelsResult = movieQualityLabelsStmt.run(newId, oldId)
      tablesUpdated.movieQualityLabels = movieQualityLabelsResult.changes

      // Update ai_metadata
      const aiMetadataStmt = db.prepare('UPDATE ai_metadata SET movieId = ? WHERE movieId = ?')
      const aiMetadataResult = aiMetadataStmt.run(newId, oldId)
      tablesUpdated.aiMetadata = aiMetadataResult.changes

      // Ratings table removed - imdbRating is sufficient

      // Update metadata
      const metadataStmt = db.prepare('UPDATE metadata SET movieId = ? WHERE movieId = ?')
      const metadataResult = metadataStmt.run(newId, oldId)
      tablesUpdated.metadata = metadataResult.changes

      // Update sources
      // Note: source_quality_marks will be updated automatically via ON DELETE CASCADE
      const sourcesStmt = db.prepare('UPDATE sources SET movieId = ? WHERE movieId = ?')
      const sourcesResult = sourcesStmt.run(newId, oldId)
      tablesUpdated.sources = sourcesResult.changes

      // Update movies table (parent table, last)
      const moviesStmt = db.prepare('UPDATE movies SET movieId = ? WHERE movieId = ?')
      const moviesResult = moviesStmt.run(newId, oldId)
      tablesUpdated.movies = moviesResult.changes

      // Verify the migration was successful
      const verifyMovie = db.prepare('SELECT movieId FROM movies WHERE movieId = ?').get(newId) as
        | { movieId: string }
        | undefined

      if (!verifyMovie) {
        throw new Error(`Verification failed: Movie with ID '${newId}' not found after migration`)
      }

      // Verify oldId no longer exists
      const verifyOldMovie = db
        .prepare('SELECT movieId FROM movies WHERE movieId = ?')
        .get(oldId) as { movieId: string } | undefined

      if (verifyOldMovie) {
        throw new Error(
          `Verification failed: Movie with ID '${oldId}' still exists after migration`
        )
      }

      return {
        success: true,
        oldId,
        newId,
        message: `Successfully migrated movie ID from '${oldId}' to '${newId}'`,
        tablesUpdated,
      }
    })
  } catch (error) {
    // Handle foreign key constraint violations and other database errors
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check for common SQLite errors
    if (errorMessage.includes('FOREIGN KEY constraint failed')) {
      return {
        success: false,
        oldId,
        newId,
        message: `Foreign key constraint violation: ${errorMessage}`,
      }
    }

    if (errorMessage.includes('UNIQUE constraint failed')) {
      return {
        success: false,
        oldId,
        newId,
        message: `Unique constraint violation: Movie ID '${newId}' already exists`,
      }
    }

    return {
      success: false,
      oldId,
      newId,
      message: `Migration failed: ${errorMessage}`,
    }
  }
}

/**
 * Batch migrate multiple movie IDs
 *
 * Migrates multiple movie IDs in a single transaction for efficiency.
 * If any migration fails, the entire batch is rolled back.
 *
 * @param migrations - Array of [oldId, newId] tuples
 * @returns Promise<MigrationResult[]> - Results for each migration
 *
 * @example
 * const results = await batchMigrateMovieIds([
 *   ['archive-123', 'tt1234567'],
 *   ['youtube-abc', 'tt7654321'],
 * ])
 * const successful = results.filter(r => r.success).length
 * console.log(`Successfully migrated ${successful}/${results.length} movies`)
 */
export async function batchMigrateMovieIds(
  migrations: Array<[string, string]>
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []

  try {
    await withTransaction(async (_db: Database) => {
      for (const [oldId, newId] of migrations) {
        // Run migration within the transaction
        const result = await migrateMovieId(oldId, newId)
        results.push(result)

        // Stop on first failure and rollback the transaction
        if (!result.success) {
          throw new Error(result.message)
        }
      }
    })
  } catch (error) {
    // If any migration fails, mark all remaining as failed
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Fill remaining results with failure messages
    while (results.length < migrations.length) {
      const migration = migrations[results.length]
      if (!migration) break

      const oldId = migration[0]
      const newId = migration[1]
      results.push({
        success: false,
        oldId,
        newId,
        message: `Batch migration rolled back due to previous failure: ${errorMessage}`,
      })
    }
  }

  return results
}
