import * as fs from 'node:fs'
import { join } from 'node:path'

const FAILED_OMDB_FILE = join(process.cwd(), 'data/failed-omdb.json')

interface TitleAttempt {
  query: string
  year?: number
}

/**
 * AI status information for debugging OMDB matching failures
 * Helps analyze the effectiveness of AI-enhanced movie metadata
 */
interface AIStatus {
  hasAITitle: boolean // Whether movie.ai?.title exists
  hasAIYear: boolean // Whether movie.ai?.year exists
  aiTitleUsed: boolean // Whether AI title was attempted in matching
}

interface FailedOmdbMatch {
  identifier: string
  originalTitle: string
  year?: number
  attempts: TitleAttempt[]
  failedAt: string
  lastAttempt: string
  reason?: string
  ai?: AIStatus // AI field status for debugging
}

/**
 * Load failed OMDB matches from disk
 */
export function loadFailedOmdbMatches(): Set<string> {
  try {
    if (fs.existsSync(FAILED_OMDB_FILE)) {
      const data = fs.readFileSync(FAILED_OMDB_FILE, 'utf-8')
      const failed: FailedOmdbMatch[] = JSON.parse(data)
      return new Set(failed.map(f => f.identifier))
    }
  } catch (error) {
    console.error('Failed to load failed OMDB matches:', error)
  }
  return new Set()
}

/**
 * Save failed OMDB match to disk with detailed attempt tracking
 * @param identifier - Movie identifier (movieId or temporary ID)
 * @param originalTitle - Original title before cleaning
 * @param reason - Reason for failure
 * @param attempts - Array of title queries attempted with their years
 * @param year - Year from source metadata
 * @param aiStatus - AI field status information for debugging
 */
export function saveFailedOmdbMatch(
  identifier: string,
  originalTitle: string,
  reason?: string,
  attempts?: TitleAttempt[],
  year?: number,
  aiStatus?: AIStatus
): void {
  try {
    const dataDir = join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    let failed: FailedOmdbMatch[] = []
    if (fs.existsSync(FAILED_OMDB_FILE)) {
      const data = fs.readFileSync(FAILED_OMDB_FILE, 'utf-8')
      failed = JSON.parse(data)
    }

    // Find existing entry
    const existingIndex = failed.findIndex(f => f.identifier === identifier)
    const now = new Date().toISOString()

    if (existingIndex >= 0) {
      // Update existing entry
      const existing = failed[existingIndex]!
      existing.lastAttempt = now
      existing.reason = reason
      if (aiStatus) {
        existing.ai = aiStatus
      }
      if (attempts && attempts.length > 0) {
        // Merge attempts, avoiding duplicates
        const existingAttempts = existing.attempts || []
        const newAttempts = attempts.filter(
          newAttempt =>
            !existingAttempts.some(
              existing => existing.query === newAttempt.query && existing.year === newAttempt.year
            )
        )
        existing.attempts = [...existingAttempts, ...newAttempts]
      }
    } else {
      // Add new failed entry
      failed.push({
        identifier,
        originalTitle,
        year,
        attempts: attempts || [],
        failedAt: now,
        lastAttempt: now,
        reason,
        ai: aiStatus,
      })
    }

    fs.writeFileSync(FAILED_OMDB_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to save failed OMDB match:', err)
  }
}

/**
 * Remove from failed OMDB matches (successful retry)
 */
export function removeFailedOmdbMatch(identifier: string): void {
  try {
    if (!fs.existsSync(FAILED_OMDB_FILE)) return

    const data = fs.readFileSync(FAILED_OMDB_FILE, 'utf-8')
    let failed: FailedOmdbMatch[] = JSON.parse(data)
    failed = failed.filter(f => f.identifier !== identifier)
    fs.writeFileSync(FAILED_OMDB_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to remove from failed OMDB matches:', err)
  }
}

/**
 * Clear all failed OMDB matches
 */
export function clearFailedOmdbMatches(): void {
  try {
    if (fs.existsSync(FAILED_OMDB_FILE)) {
      fs.unlinkSync(FAILED_OMDB_FILE)
    }
  } catch (err) {
    console.error('Failed to clear failed OMDB matches:', err)
  }
}

/**
 * Get all failed OMDB matches with details
 */
export function getFailedOmdbMatches(): FailedOmdbMatch[] {
  try {
    if (fs.existsSync(FAILED_OMDB_FILE)) {
      const data = fs.readFileSync(FAILED_OMDB_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load failed OMDB matches:', error)
  }
  return []
}
