import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { join } from 'node:path'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, Page } from 'puppeteer'

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin())

const POSTERS_DIR = join(process.cwd(), 'public/posters')
const FAILED_DOWNLOADS_FILE = join(process.cwd(), 'data/failed-posters.json')

interface FailedDownload {
  movieId?: string
  imdbId?: string // Legacy field name
  url: string
  failedAt: string
  error: string
}

interface ScrapeStats {
  total: number
  attempted: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{ movieId: string; error: string }>
}

/**
 * Download image from URL to filepath
 */
function downloadImage(url: string, filepath: string, timeout: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const options = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }

    const request = client.get(url, options, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadImage(redirectUrl, filepath, timeout).then(resolve).catch(reject)
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

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract poster URL from IMDB page using headless browser
 */
async function extractPosterUrlWithBrowser(page: Page, movieId: string): Promise<string | null> {
  const imdbUrl = `https://www.imdb.com/title/${movieId}/`

  try {
    // Navigate to IMDB page with timeout
    await page.goto(imdbUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    // Wait for the poster image to load
    // IMDB uses ipc-image class for poster images
    await page.waitForSelector('img.ipc-image[loading="eager"]', { timeout: 10000 })

    // Extract poster URL using page.evaluate
    const posterUrl = await page.evaluate(() => {
      // Find the poster image - it's usually the first eager-loaded ipc-image
      const posterImg = document.querySelector(
        'img.ipc-image[loading="eager"]'
      ) as HTMLImageElement | null
      if (posterImg && posterImg.src) {
        // Get higher quality version
        return posterImg.src.replace(/_V1_[^.]+\.jpg/, '_V1_SX300.jpg')
      }
      return null
    })

    return posterUrl
  } catch {
    // Try alternative selector if first one fails
    try {
      const posterUrl = await page.evaluate(() => {
        // Alternative: look for any poster-related image
        const posterImg = document.querySelector(
          '[data-testid="hero-media__poster"] img'
        ) as HTMLImageElement | null
        if (posterImg && posterImg.src) {
          return posterImg.src.replace(/_V1_[^.]+\.jpg/, '_V1_SX300.jpg')
        }
        return null
      })
      return posterUrl
    } catch {
      return null
    }
  }
}

/**
 * Scrape and download poster for a single IMDB ID using headless browser
 */
async function scrapePosterHeadless(
  page: Page,
  movieId: string,
  stats: ScrapeStats
): Promise<boolean> {
  const filepath = join(POSTERS_DIR, `${movieId}.jpg`)

  // Skip if poster already exists
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
    stats.skipped++
    return true
  }

  try {
    stats.attempted++

    // Extract poster URL using headless browser
    const posterUrl = await extractPosterUrlWithBrowser(page, movieId)
    if (!posterUrl) {
      throw new Error('No poster image found on IMDB page')
    }

    // Download poster
    await downloadImage(posterUrl, filepath)

    stats.successful++
    console.log(`[${stats.attempted}/${stats.total}] Successfully downloaded: ${movieId}`)
    return true
  } catch (error) {
    stats.failed++
    const errorMsg = error instanceof Error ? error.message : String(error)
    stats.errors.push({ movieId, error: errorMsg })
    console.error(`[${stats.attempted}/${stats.total}] Failed: ${movieId} - ${errorMsg}`)
    return false
  }
}

/**
 * Main function to scrape IMDB posters using headless browser
 */
async function scrapeImdbPostersHeadless(options: {
  movieIds?: string[]
  limit?: number
  delayMs?: number
  dryRun?: boolean
  useFailedList?: boolean
  concurrency?: number
}) {
  const {
    movieIds,
    limit,
    delayMs = 1500,
    dryRun = false,
    useFailedList = false,
    concurrency = 3,
  } = options

  // Ensure posters directory exists
  if (!fs.existsSync(POSTERS_DIR)) {
    fs.mkdirSync(POSTERS_DIR, { recursive: true })
  }

  let idsToScrape: string[] = []

  // Determine which IDs to scrape
  if (useFailedList) {
    // Load from failed downloads file
    if (!fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      console.error('Error: No failed posters file found at:', FAILED_DOWNLOADS_FILE)
      process.exit(1)
    }

    const failedDownloads: FailedDownload[] = JSON.parse(
      fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
    )

    // Filter to only IMDb IDs with "No poster found" error (WAF blocked)
    idsToScrape = failedDownloads
      .filter(f => {
        const id = f.movieId || f.imdbId || ''
        return id.startsWith('tt') && f.error.includes('No poster found on IMDB page')
      })
      .map(f => f.movieId || f.imdbId || '')

    console.log(`\nFound ${failedDownloads.length} total failed poster downloads`)
    console.log(`${idsToScrape.length} are IMDb movies blocked by WAF`)
  } else if (movieIds && movieIds.length > 0) {
    idsToScrape = movieIds
  } else {
    console.error('Error: No IMDB IDs provided. Use --ids or --use-failed-list')
    process.exit(1)
  }

  // Apply limit if specified
  const toScrape = limit ? idsToScrape.slice(0, limit) : idsToScrape
  console.log(`Will attempt to scrape ${toScrape.length} posters using headless browser`)

  if (dryRun) {
    console.log('\nDRY RUN MODE - No downloads will be performed\n')
    console.log('Sample URLs that would be scraped:')
    toScrape.slice(0, 5).forEach(id => {
      console.log(`  ${id}: https://www.imdb.com/title/${id}/`)
    })
    return
  }

  // Initialize stats
  const stats: ScrapeStats = {
    total: toScrape.length,
    attempted: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  console.log('\nStarting headless browser scrape process...')
  console.log(`Concurrency: ${concurrency} browser instances`)
  console.log(`Delay between requests: ${delayMs}ms\n`)

  const startTime = Date.now()
  const successfulIds: string[] = []

  // Launch browser
  let browser: Browser | null = null
  try {
    console.log('Launching headless browser...')
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    })
    console.log('Browser launched successfully\n')

    // Process in batches for concurrency
    for (let i = 0; i < toScrape.length; i += concurrency) {
      const batch = toScrape.slice(i, i + concurrency)

      // Create pages for this batch
      const pages = await Promise.all(batch.map(() => browser!.newPage()))

      // Set viewport and user agent for each page
      await Promise.all(
        pages.map(async page => {
          await page.setViewport({ width: 1920, height: 1080 })
          await page.setUserAgent(
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          )
        })
      )

      // Process batch concurrently
      const results = await Promise.all(
        batch.map(async (movieId, idx) => {
          const page = pages[idx]!
          const success = await scrapePosterHeadless(page, movieId, stats)
          if (success && fs.existsSync(join(POSTERS_DIR, `${movieId}.jpg`))) {
            return movieId
          }
          return null
        })
      )

      // Collect successful IDs
      results.forEach(id => {
        if (id) successfulIds.push(id)
      })

      // Close pages
      await Promise.all(pages.map(page => page.close()))

      // Rate limiting delay between batches
      if (i + concurrency < toScrape.length) {
        await sleep(delayMs)
      }
    }
  } finally {
    // Close browser
    if (browser) {
      await browser.close()
      console.log('\nBrowser closed')
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  // Update failed-posters.json if we used the failed list
  if (useFailedList && successfulIds.length > 0) {
    console.log(
      `\nUpdating failed-posters.json to remove ${successfulIds.length} successful downloads...`
    )
    const failedDownloads: FailedDownload[] = JSON.parse(
      fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
    )
    const successSet = new Set(successfulIds)
    const updatedFailures = failedDownloads.filter(f => !successSet.has(f.movieId))
    fs.writeFileSync(FAILED_DOWNLOADS_FILE, JSON.stringify(updatedFailures, null, 2))
    console.log(
      `Updated failed-posters.json (${failedDownloads.length} -> ${updatedFailures.length})`
    )
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('HEADLESS SCRAPE SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total IDs:                ${idsToScrape.length}`)
  console.log(`Attempted:                ${stats.attempted}`)
  console.log(
    `Successful:               ${stats.successful} (${stats.attempted > 0 ? ((stats.successful / stats.attempted) * 100).toFixed(1) : 0}%)`
  )
  console.log(`Failed:                   ${stats.failed}`)
  console.log(`Skipped (already exist):  ${stats.skipped}`)
  console.log(`Duration:                 ${duration}s`)
  console.log('='.repeat(60))

  if (stats.errors.length > 0 && stats.errors.length <= 10) {
    console.log('\nErrors:')
    stats.errors.forEach(e => {
      console.log(`  ${e.movieId}: ${e.error}`)
    })
  } else if (stats.errors.length > 10) {
    console.log(`\n${stats.errors.length} errors occurred (showing first 10):`)
    stats.errors.slice(0, 10).forEach(e => {
      console.log(`  ${e.movieId}: ${e.error}`)
    })
  }

  console.log('\nDone!\n')
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: {
  movieIds?: string[]
  limit?: number
  delayMs?: number
  dryRun?: boolean
  useFailedList?: boolean
  concurrency?: number
} = {}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--ids' && args[i + 1]) {
    options.movieIds = args[i + 1]!.split(',')
    i++
  } else if (arg === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1]!, 10)
    i++
  } else if (arg === '--delay' && args[i + 1]) {
    options.delayMs = parseInt(args[i + 1]!, 10)
    i++
  } else if (arg === '--concurrency' && args[i + 1]) {
    options.concurrency = parseInt(args[i + 1]!, 10)
    i++
  } else if (arg === '--dry-run') {
    options.dryRun = true
  } else if (arg === '--use-failed-list') {
    options.useFailedList = true
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: pnpm tsx scripts/scrape-imdb-headless.ts [options]

Scrape poster images from IMDB using headless browser (bypasses WAF).

Options:
  --ids <ids>          Comma-separated list of IMDB IDs (e.g., tt0151916,tt0068646)
  --use-failed-list    Use the failed-posters.json file as source (filters WAF-blocked only)
  --limit <n>          Only scrape the first N posters (default: all)
  --delay <ms>         Delay between batches in milliseconds (default: 1500)
  --concurrency <n>    Number of concurrent browser pages (default: 3)
  --dry-run            Show what would be done without actually downloading
  --help, -h           Show this help message

Examples:
  pnpm tsx scripts/scrape-imdb-headless.ts --ids tt0151916,tt0068646
  pnpm tsx scripts/scrape-imdb-headless.ts --use-failed-list --limit 10
  pnpm tsx scripts/scrape-imdb-headless.ts --use-failed-list --concurrency 5
  pnpm tsx scripts/scrape-imdb-headless.ts --ids tt0151916 --delay 2000
`)
    process.exit(0)
  }
}

// Run the script
scrapeImdbPostersHeadless(options).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
