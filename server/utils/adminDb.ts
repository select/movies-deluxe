/**
 * Admin Database Connection Manager
 *
 * This module manages the connection to the admin SQLite database (data/movies.db).
 * The admin DB is the source of truth for all movie data and supports concurrent
 * reads/writes using WAL mode.
 *
 * Features:
 * - Singleton connection pattern
 * - WAL mode for concurrent operations
 * - Optimized pragmas for performance
 * - Connection health checks
 * - Graceful shutdown
 * - Error handling with retry logic
 * - Transaction support
 */

import Database from 'better-sqlite3'
import { join } from 'path'

// ============================================================================
// STATE
// ============================================================================

let adminDb: Database.Database | null = null
let isShuttingDown = false

// ============================================================================
// CONFIGURATION
// ============================================================================

const DB_PATH = join(process.cwd(), 'data/movies.db')

// Performance pragmas
const PRAGMAS = {
  journal_mode: 'WAL', // Write-Ahead Logging for better concurrency
  foreign_keys: 'ON', // Enforce foreign key constraints
  synchronous: 'NORMAL', // Balance between safety and performance
  cache_size: -64000, // 64MB cache (negative = kibibytes)
  mmap_size: 30000000000, // 30GB memory-mapped I/O
  temp_store: 'MEMORY', // Store temp tables in memory
}

// Retry configuration
const DEFAULT_MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 100
const MAX_RETRY_DELAY_MS = 5000

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Get the admin database connection (singleton pattern)
 * Creates a new connection if one doesn't exist, or returns the existing one
 */
export function getAdminDatabase(): Database.Database {
  if (isShuttingDown) {
    throw new Error('Admin database is shutting down')
  }

  if (!adminDb) {
    try {
      // Create database connection
      adminDb = new Database(DB_PATH, {
        // Enable verbose mode in development for debugging
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      })

      // Configure pragmas for optimal performance
      configurePragmas(adminDb)

      // Verify connection health
      verifyConnection(adminDb)

      console.log(`[AdminDB] Connected to admin database: ${DB_PATH}`)
    } catch (error) {
      adminDb = null
      throw new Error(`Failed to initialize admin database: ${error}`)
    }
  }

  return adminDb
}

/**
 * Configure database pragmas for optimal performance
 */
function configurePragmas(db: Database.Database): void {
  try {
    for (const [pragma, value] of Object.entries(PRAGMAS)) {
      db.pragma(`${pragma} = ${value}`)
    }
  } catch (error) {
    throw new Error(`Failed to configure pragmas: ${error}`)
  }
}

/**
 * Verify database connection health
 * Throws an error if the database is not accessible
 */
function verifyConnection(db: Database.Database): void {
  try {
    // Simple query to verify connection
    const result = db.prepare('SELECT 1 as test').get() as { test: number }
    if (result.test !== 1) {
      throw new Error('Database health check failed: unexpected result')
    }
  } catch (error) {
    throw new Error(`Database health check failed: ${error}`)
  }
}

/**
 * Close the admin database connection
 * Should be called during server shutdown
 */
export function closeAdminDatabase(): void {
  if (adminDb) {
    try {
      isShuttingDown = true
      adminDb.close()
      adminDb = null
      console.log('[AdminDB] Admin database connection closed')
    } catch (error) {
      console.error('[AdminDB] Error closing admin database:', error)
      throw error
    } finally {
      isShuttingDown = false
    }
  }
}

/**
 * Check if the database connection is healthy
 * Returns true if the connection is active and responsive
 */
export function isHealthy(): boolean {
  if (!adminDb || isShuttingDown) {
    return false
  }

  try {
    verifyConnection(adminDb)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// TRANSACTION SUPPORT
// ============================================================================

/**
 * Execute a function within a transaction
 * Automatically commits on success and rolls back on error
 *
 * @param fn - Function to execute within the transaction
 * @returns Promise resolving to the function's return value
 *
 * @example
 * await withTransaction(async (db) => {
 *   db.prepare('INSERT INTO movies ...').run(...)
 *   db.prepare('INSERT INTO sources ...').run(...)
 * })
 */
export async function withTransaction<T>(
  fn: (db: Database.Database) => T | Promise<T>
): Promise<T> {
  const db = getAdminDatabase()

  // better-sqlite3 transactions are synchronous, so we wrap the user's function
  const transaction = db.transaction(() => {
    return fn(db)
  })

  try {
    const result = transaction()
    // If the result is a promise, await it
    if (result instanceof Promise) {
      return await result
    }
    return result
  } catch (error) {
    // Transaction automatically rolled back by better-sqlite3
    throw new Error(`Transaction failed: ${error}`)
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Execute a function with exponential backoff retry logic
 * Useful for handling temporary database locks or busy errors
 *
 * @param fn - Function to execute with retry logic
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise resolving to the function's return value
 *
 * @example
 * const result = await withRetry(async () => {
 *   return db.prepare('SELECT * FROM movies WHERE movieId = ?').get(movieId)
 * }, 5)
 */
export async function withRetry<T>(
  fn: () => T | Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T> {
  let lastError: Error | unknown
  let delay = INITIAL_RETRY_DELAY_MS

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if error is retryable (database locked or busy)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable =
        errorMessage.includes('SQLITE_BUSY') ||
        errorMessage.includes('SQLITE_LOCKED') ||
        errorMessage.includes('database is locked')

      if (!isRetryable || attempt === maxRetries) {
        break
      }

      // Log retry attempt
      console.warn(
        `[AdminDB] Retry attempt ${attempt + 1}/${maxRetries} after error: ${errorMessage}`
      )

      // Wait with exponential backoff
      await sleep(delay)
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    }
  }

  throw new Error(`Operation failed after ${maxRetries} retries: ${lastError}`)
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

// Register shutdown handlers
if (typeof process !== 'undefined') {
  const shutdownHandler = () => {
    console.log('[AdminDB] Shutting down admin database...')
    closeAdminDatabase()
  }

  process.on('SIGINT', shutdownHandler)
  process.on('SIGTERM', shutdownHandler)
  process.on('exit', shutdownHandler)
}
