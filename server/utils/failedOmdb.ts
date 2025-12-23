import * as fs from 'node:fs'
import { join } from 'node:path'

const FAILED_OMDB_FILE = join(process.cwd(), 'public/data/failed-omdb.json')

interface FailedOmdbMatch {
  identifier: string
  title: string
  failedAt: string
  reason?: string
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
 * Save failed OMDB match to disk
 */
export function saveFailedOmdbMatch(identifier: string, title: string, reason?: string): void {
  try {
    const dataDir = join(process.cwd(), 'public/data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    let failed: FailedOmdbMatch[] = []
    if (fs.existsSync(FAILED_OMDB_FILE)) {
      const data = fs.readFileSync(FAILED_OMDB_FILE, 'utf-8')
      failed = JSON.parse(data)
    }

    // Remove existing entry if present
    failed = failed.filter(f => f.identifier !== identifier)

    // Add new failed entry
    failed.push({
      identifier,
      title,
      failedAt: new Date().toISOString(),
      reason,
    })

    fs.writeFileSync(FAILED_OMDB_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to save failed OMDB match:', err)
  }
}

/**
 * Check if identifier has previously failed OMDB matching
 */
export function hasFailedOmdbMatch(identifier: string): boolean {
  const failed = loadFailedOmdbMatches()
  return failed.has(identifier)
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
