import * as fs from 'node:fs'
import { join } from 'node:path'

const FAILED_AI_FILE = join(process.cwd(), 'data/failed-ai.json')

/**
 * AI extraction attempt information
 */
interface AIExtractionAttempt {
  title: string // Title used for extraction
  description: string // Description used for extraction
  timestamp: string // When the attempt was made
}

/**
 * Failed AI extraction entry
 */
interface FailedAIExtraction {
  identifier: string // Movie identifier (imdbId or temporary ID)
  originalTitle: string // Original title from source
  attempts: AIExtractionAttempt[] // All extraction attempts
  failedAt: string // ISO timestamp of first failure
  lastAttempt: string // ISO timestamp of last attempt
  reason?: string // Failure reason
  sourceInfo?: {
    // Information about the source used
    type: string // Source type (archive.org, youtube, etc.)
    hasDescription: boolean // Whether source had description
    titleLength: number // Length of title used
    descriptionLength: number // Length of description used
  }
}

/**
 * Load failed AI extractions from disk
 */
export function loadFailedAIExtractions(): Set<string> {
  try {
    if (fs.existsSync(FAILED_AI_FILE)) {
      const data = fs.readFileSync(FAILED_AI_FILE, 'utf-8')
      const failed: FailedAIExtraction[] = JSON.parse(data)
      return new Set(failed.map(f => f.identifier))
    }
  } catch (error) {
    console.error('Failed to load failed AI extractions:', error)
  }
  return new Set()
}

/**
 * Save failed AI extraction to disk with detailed attempt tracking
 * @param identifier - Movie identifier (imdbId or temporary ID)
 * @param originalTitle - Original title from source
 * @param reason - Reason for failure
 * @param attempt - Extraction attempt details
 * @param sourceInfo - Information about the source used
 */
export function saveFailedAIExtraction(
  identifier: string,
  originalTitle: string,
  reason?: string,
  attempt?: AIExtractionAttempt,
  sourceInfo?: FailedAIExtraction['sourceInfo']
): void {
  try {
    const dataDir = join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    let failed: FailedAIExtraction[] = []
    if (fs.existsSync(FAILED_AI_FILE)) {
      const data = fs.readFileSync(FAILED_AI_FILE, 'utf-8')
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
      if (sourceInfo) {
        existing.sourceInfo = sourceInfo
      }
      if (attempt) {
        // Add new attempt, avoiding duplicates
        const existingAttempts = existing.attempts || []
        const isDuplicate = existingAttempts.some(
          existingAttempt =>
            existingAttempt.title === attempt.title &&
            existingAttempt.description === attempt.description
        )
        if (!isDuplicate) {
          existing.attempts = [...existingAttempts, attempt]
        }
      }
    } else {
      // Add new failed entry
      failed.push({
        identifier,
        originalTitle,
        attempts: attempt ? [attempt] : [],
        failedAt: now,
        lastAttempt: now,
        reason,
        sourceInfo,
      })
    }

    fs.writeFileSync(FAILED_AI_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to save failed AI extraction:', err)
  }
}

/**
 * Remove from failed AI extractions (successful retry)
 */
export function removeFailedAIExtraction(identifier: string): void {
  try {
    if (!fs.existsSync(FAILED_AI_FILE)) return

    const data = fs.readFileSync(FAILED_AI_FILE, 'utf-8')
    let failed: FailedAIExtraction[] = JSON.parse(data)
    failed = failed.filter(f => f.identifier !== identifier)
    fs.writeFileSync(FAILED_AI_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to remove from failed AI extractions:', err)
  }
}

/**
 * Clear all failed AI extractions
 */
export function clearFailedAIExtractions(): void {
  try {
    if (fs.existsSync(FAILED_AI_FILE)) {
      fs.unlinkSync(FAILED_AI_FILE)
    }
  } catch (err) {
    console.error('Failed to clear failed AI extractions:', err)
  }
}

/**
 * Get all failed AI extractions with details
 */
export function getFailedAIExtractions(): FailedAIExtraction[] {
  try {
    if (fs.existsSync(FAILED_AI_FILE)) {
      const data = fs.readFileSync(FAILED_AI_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load failed AI extractions:', error)
  }
  return []
}

/**
 * Check if an identifier has failed AI extraction
 */
export function hasFailedAIExtraction(identifier: string): boolean {
  const failedSet = loadFailedAIExtractions()
  return failedSet.has(identifier)
}
