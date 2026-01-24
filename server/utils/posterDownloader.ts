import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { join } from 'node:path'
import { loadMoviesDatabase, saveMoviesDatabase, migrateMovieId } from './movieData'

const FAILED_DOWNLOADS_FILE = join(process.cwd(), 'data/failed-posters.json')

interface FailedDownload {
  movieId: string
  url: string
  failedAt: string
  error: string
}

/**
 * Load failed downloads from disk
 * Returns a Set of movieIds that have previously failed
 */
export function loadFailedPosterIds(): Set<string> {
  try {
    if (fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
      const failed: FailedDownload[] = JSON.parse(data)
      return new Set(failed.map(f => f.movieId))
    }
  } catch (error) {
    console.error('Failed to load failed downloads:', error)
  }
  return new Set()
}

/**
 * Save failed download to disk
 */
function saveFailedDownload(movieId: string, url: string, error: string): void {
  try {
    const dataDir = join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    let failed: FailedDownload[] = []
    if (fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
      failed = JSON.parse(data)
    }

    // Remove existing entry if present
    failed = failed.filter(f => f.movieId !== movieId)

    // Add new failed entry
    failed.push({
      movieId,
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
function removeFailedDownload(movieId: string): void {
  try {
    if (!fs.existsSync(FAILED_DOWNLOADS_FILE)) return

    const data = fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
    let failed: FailedDownload[] = JSON.parse(data)
    failed = failed.filter(f => f.movieId !== movieId)
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

/**
 * Fetch HTML content from URL with proper headers
 * Returns both HTML and final URL (after redirects)
 */
async function fetchHtml(
  url: string,
  timeout: number = 30000
): Promise<{ html: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }

    const request = https.get(url, options, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          fetchHtml(redirectUrl, timeout).then(resolve).catch(reject)
          return
        }
      }

      // Check status code
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      let html = ''
      response.on('data', chunk => {
        html += chunk
      })

      response.on('end', () => {
        resolve({ html, finalUrl: url })
      })
    })

    request.on('error', reject)
    request.setTimeout(timeout, () => {
      request.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

/**
 * Extract poster URL from IMDB page HTML
 */
function extractPosterUrl(html: string): string | null {
  // Look for the first ipc-image with loading="eager" (usually the poster)
  // Updated regex to handle attributes in any order
  const posterRegex = /<img[^>]*class="ipc-image"[^>]*loading="eager"[^>]*src="([^"]+)"/
  const match = html.match(posterRegex)

  if (match && match[1]) {
    // Get the URL and try to get a higher quality version
    let url = match[1]

    // IMDB URLs often have quality parameters like _V1_QL75_UY281_CR45,0,190,281_.jpg
    // We can try to get a larger version by modifying these parameters
    // Replace with higher quality: _V1_SX300.jpg (similar to OMDB)
    url = url.replace(/_V1_[^.]+\.jpg/, '_V1_SX300.jpg')

    return url
  }

  return null
}

/**
 * Scrape poster URL from IMDB page
 * Returns poster URL and new IMDB ID if the page was redirected
 */
async function scrapeImdbPoster(
  movieId: string
): Promise<{ posterUrl: string | null; newImdbId: string | null }> {
  try {
    const imdbUrl = `https://www.imdb.com/title/${movieId}/`
    const { html, finalUrl } = await fetchHtml(imdbUrl)

    // Extract new IMDB ID from final URL if redirected
    let newImdbId: string | null = null
    const imdbIdMatch = finalUrl.match(/\/title\/(tt\d+)/)
    if (imdbIdMatch && imdbIdMatch[1] && imdbIdMatch[1] !== movieId) {
      newImdbId = imdbIdMatch[1]
      console.log(`IMDB ID redirect detected: ${movieId} -> ${newImdbId}`)
    }

    const posterUrl = extractPosterUrl(html)
    return { posterUrl, newImdbId }
  } catch {
    return { posterUrl: null, newImdbId: null }
  }
}

export async function downloadPoster(movieId: string, force: boolean = false): Promise<boolean> {
  if (!movieId) return false

  const postersDir = join(process.cwd(), 'public/posters')
  if (!fs.existsSync(postersDir)) {
    fs.mkdirSync(postersDir, { recursive: true })
  }

  const filepath = join(postersDir, `${movieId}.jpg`)

  // Skip if already exists
  if (!force && fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
    return true
  }

  // Build URLs to try in order of preference
  const urlsToTry: string[] = []

  // 1. For IMDb IDs, try OMDB Poster API first (most reliable)
  if (movieId.startsWith('tt')) {
    const omdbApiKey = process.env.OMDB_API_KEY
    if (omdbApiKey && omdbApiKey !== 'your_omdb_api_key_here') {
      const omdbPosterUrl = `http://img.omdbapi.com/?apikey=${omdbApiKey}&i=${movieId}`
      urlsToTry.push(omdbPosterUrl)
    }
  }

  // If no URLs to try, fail early
  if (urlsToTry.length === 0) {
    return false
  }

  let lastError: string = ''

  // Try OMDB Poster API first
  for (let i = 0; i < urlsToTry.length; i++) {
    const currentUrl = urlsToTry[i]!
    const isOmdbApi = currentUrl.includes('img.omdbapi.com')
    const isFallback = i > 0

    try {
      if (isFallback) {
        const source = isOmdbApi ? 'OMDB Poster API' : 'fallback URL'
        console.log(`Trying ${source} ${i} for ${movieId}`)
      }
      await downloadImageOnce(currentUrl, filepath, 30000)
      // Remove from failed downloads if it was there
      removeFailedDownload(movieId)
      if (isFallback) {
        const source = isOmdbApi ? 'OMDB Poster API' : 'fallback URL'
        console.log(`✅ Successfully downloaded from ${source} ${i} for ${movieId}`)
      }
      return true
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (isFallback) {
        const source = isOmdbApi ? 'OMDB Poster API' : 'fallback URL'
        console.error(`Failed ${source} ${i} for ${movieId}:`, lastError)
      }
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
      // Continue to next method
    }
  }

  // 2. If OMDB API failed and this is an IMDB ID, try scraping IMDB page
  if (movieId.startsWith('tt')) {
    try {
      console.log(`Trying IMDB scraping fallback for ${movieId}`)
      const { posterUrl: scrapedUrl, newImdbId } = await scrapeImdbPoster(movieId)

      // Handle IMDB ID redirect
      if (newImdbId && newImdbId !== movieId) {
        console.log(`Migrating movie ID from ${movieId} to ${newImdbId}`)

        // Load database and migrate
        const db = await loadMoviesDatabase()
        await migrateMovieId(db, movieId, newImdbId)
        await saveMoviesDatabase(db)

        // Rename poster file if it exists
        const oldPosterPath = join(postersDir, `${movieId}.jpg`)
        const newPosterPath = join(postersDir, `${newImdbId}.jpg`)

        if (fs.existsSync(oldPosterPath)) {
          fs.renameSync(oldPosterPath, newPosterPath)
          console.log(`Renamed poster from ${movieId}.jpg to ${newImdbId}.jpg`)
        }

        // Update failed downloads tracking
        removeFailedDownload(movieId)

        // Continue with new ID
        if (scrapedUrl) {
          await downloadImageOnce(scrapedUrl, newPosterPath, 30000)
          console.log(`✅ Successfully downloaded poster for migrated ID ${newImdbId}`)
          return true
        } else {
          lastError = 'No poster found on IMDB page'
          console.error(`Failed IMDB scraping for migrated ID ${newImdbId}: ${lastError}`)
        }
      } else if (scrapedUrl) {
        // No redirect, just download poster normally
        await downloadImageOnce(scrapedUrl, filepath, 30000)
        removeFailedDownload(movieId)
        console.log(`✅ Successfully downloaded from IMDB scraping for ${movieId}`)
        return true
      } else {
        lastError = 'No poster found on IMDB page'
        console.error(`Failed IMDB scraping for ${movieId}: ${lastError}`)
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`Failed IMDB scraping for ${movieId}:`, lastError)
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
    }
  }

  // All methods failed
  console.error(
    `Failed to download poster for ${movieId} (tried ${urlsToTry.length + 1} methods):`,
    lastError
  )
  // Track failed download with the first URL tried
  const urlToLog = urlsToTry[0] || 'N/A'
  saveFailedDownload(movieId, urlToLog, lastError)
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
