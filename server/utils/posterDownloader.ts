import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { join } from 'node:path'

const FAILED_DOWNLOADS_FILE = join(process.cwd(), 'public/data/failed-posters.json')

interface FailedDownload {
  imdbId: string
  url: string
  failedAt: string
  error: string
}

/**
 * Load failed downloads from disk
 * Returns a Set of imdbIds that have previously failed
 */
export function loadFailedPosterIds(): Set<string> {
  try {
    if (fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
      const failed: FailedDownload[] = JSON.parse(data)
      return new Set(failed.map(f => f.imdbId))
    }
  } catch (error) {
    console.error('Failed to load failed downloads:', error)
  }
  return new Set()
}

/**
 * Save failed download to disk
 */
function saveFailedDownload(imdbId: string, url: string, error: string): void {
  try {
    const dataDir = join(process.cwd(), 'public/data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    let failed: FailedDownload[] = []
    if (fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
      failed = JSON.parse(data)
    }

    // Remove existing entry if present
    failed = failed.filter(f => f.imdbId !== imdbId)

    // Add new failed entry
    failed.push({
      imdbId,
      url,
      failedAt: new Date().toISOString(),
      error,
    })

    fs.writeFileSync(FAILED_DOWNLOADS_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to save failed download:', err)
  }
}

/**
 * Remove from failed downloads (successful retry)
 */
function removeFailedDownload(imdbId: string): void {
  try {
    if (!fs.existsSync(FAILED_DOWNLOADS_FILE)) return

    const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
    let failed: FailedDownload[] = JSON.parse(data)
    failed = failed.filter(f => f.imdbId !== imdbId)
    fs.writeFileSync(FAILED_DOWNLOADS_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to remove from failed downloads:', err)
  }
}

/**
 * Get all failed poster downloads with details
 */
export function getFailedPosterDownloads(): FailedDownload[] {
  try {
    if (fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load failed poster downloads:', error)
  }
  return []
}

export async function downloadPoster(
  url: string,
  imdbId: string,
  force: boolean = false,
  fallbackUrls: string[] = []
): Promise<boolean> {
  if (!imdbId) return false

  const postersDir = join(process.cwd(), 'public/posters')
  if (!fs.existsSync(postersDir)) {
    fs.mkdirSync(postersDir, { recursive: true })
  }

  const filepath = join(postersDir, `${imdbId}.jpg`)

  // Skip if already exists
  if (!force && fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
    return true
  }

  // Build URLs to try in order of preference
  const urlsToTry: string[] = []

  // 1. For IMDb IDs, try OMDB Poster API first (most reliable)
  if (imdbId.startsWith('tt')) {
    const omdbApiKey = process.env.OMDB_API_KEY
    if (omdbApiKey && omdbApiKey !== 'your_omdb_api_key_here') {
      const omdbPosterUrl = `http://img.omdbapi.com/?apikey=${omdbApiKey}&i=${imdbId}`
      urlsToTry.push(omdbPosterUrl)
    }
  }

  // 2. Add the original URL if provided
  if (url && url !== 'N/A') {
    urlsToTry.push(url)
  }

  // 3. Add any additional fallback URLs
  urlsToTry.push(...fallbackUrls.filter(u => u && u !== 'N/A'))

  // If no URLs to try, fail early
  if (urlsToTry.length === 0) {
    return false
  }

  let lastError: string = ''
  for (let i = 0; i < urlsToTry.length; i++) {
    const currentUrl = urlsToTry[i]!
    const isOmdbApi = currentUrl.includes('img.omdbapi.com')
    const isFallback = i > 0

    try {
      if (isFallback) {
        const source = isOmdbApi ? 'OMDB Poster API' : 'fallback URL'
        console.log(`Trying ${source} ${i} for ${imdbId}`)
      }
      await downloadImageOnce(currentUrl, filepath, 30000)
      // Remove from failed downloads if it was there
      removeFailedDownload(imdbId)
      if (isFallback) {
        const source = isOmdbApi ? 'OMDB Poster API' : 'fallback URL'
        console.log(`✅ Successfully downloaded from ${source} ${i} for ${imdbId}`)
      }
      return true
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (isFallback) {
        const source = isOmdbApi ? 'OMDB Poster API' : 'fallback URL'
        console.error(`Failed ${source} ${i} for ${imdbId}:`, lastError)
      }
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
      // Continue to next URL
    }
  }

  // All URLs failed
  console.error(
    `Failed to download poster for ${imdbId} (tried ${urlsToTry.length} URLs):`,
    lastError
  )
  // Track failed download with the original URL (or first URL tried)
  const urlToLog = url && url !== 'N/A' ? url : urlsToTry[0] || 'N/A'
  saveFailedDownload(imdbId, urlToLog, lastError)
  return false
}

function downloadImageOnce(url: string, filepath: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const request = client.get(url, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadImageOnce(redirectUrl, filepath, timeout).then(resolve).catch(reject)
          return
        }
      }

      // Check status code
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      // Create write stream
      const fileStream = fs.createWriteStream(filepath)

      response.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close()
        resolve()
      })

      fileStream.on('error', err => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath)
        }
        reject(err)
      })
    })

    request.on('error', reject)
    request.setTimeout(timeout, () => {
      request.destroy()
      reject(new Error('Request timeout'))
    })
  })
}
