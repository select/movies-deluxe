import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { join } from 'node:path'

const POSTERS_DIR = join(process.cwd(), 'public/posters')
const FAILED_DOWNLOADS_FILE = join(process.cwd(), 'data/failed-posters.json')

interface FailedDownload {
  movieId: string
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
 * Fetch HTML content from URL with proper headers
 */
function fetchHtml(url: string, timeout: number = 30000): Promise<string> {
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
        resolve(html)
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
 * Extract poster URL from IMDB page HTML
 */
function extractPosterUrl(html: string): string | null {
  // Look for the first ipc-image with loading="eager" (usually the poster)
  const posterRegex = /class="ipc-image"\s+loading="eager"\s+src="([^"]+)"/
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
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Scrape and download poster for a single IMDB ID
 */
async function scrapePoster(movieId: string, stats: ScrapeStats): Promise<boolean> {
  const filepath = join(POSTERS_DIR, `${movieId}.jpg`)

  // Skip if poster already exists
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
    stats.skipped++
    return true
  }

  try {
    stats.attempted++

    // Fetch IMDB page
    const imdbUrl = `https://www.imdb.com/title/${movieId}/`
    const html = await fetchHtml(imdbUrl)

    // Extract poster URL
    const posterUrl = extractPosterUrl(html)
    if (!posterUrl) {
      throw new Error('No poster image found on IMDB page')
    }

    // Download poster
    await downloadImage(posterUrl, filepath)

    stats.successful++
    console.log(`✅ [${stats.attempted}/${stats.total}] Successfully downloaded: ${movieId}`)
    return true
  } catch (error) {
    stats.failed++
    const errorMsg = error instanceof Error ? error.message : String(error)
    stats.errors.push({ movieId, error: errorMsg })
    console.error(`❌ [${stats.attempted}/${stats.total}] Failed: ${movieId} - ${errorMsg}`)
    return false
  }
}

/**
 * Main function to scrape IMDB posters
 */
async function scrapeImdbPosters(options: {
  movieIds?: string[]
  limit?: number
  delayMs?: number
  dryRun?: boolean
  useFailedList?: boolean
}) {
  const { movieIds, limit, delayMs = 1000, dryRun = false, useFailedList = false } = options

  // Ensure posters directory exists
  if (!fs.existsSync(POSTERS_DIR)) {
    fs.mkdirSync(POSTERS_DIR, { recursive: true })
  }

  let idsToScrape: string[] = []

  // Determine which IDs to scrape
  if (useFailedList) {
    // Load from failed downloads file
    if (!fs.existsSync(FAILED_DOWNLOADS_FILE)) {
      console.error('❌ Error: No failed posters file found at:', FAILED_DOWNLOADS_FILE)
      process.exit(1)
    }

    const failedDownloads: FailedDownload[] = JSON.parse(
      fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
    )

    // Filter to only IMDb IDs
    idsToScrape = failedDownloads.filter(f => f.movieId.startsWith('tt')).map(f => f.movieId)

    console.log(`\n📊 Found ${failedDownloads.length} failed poster downloads`)
    console.log(`📊 ${idsToScrape.length} are IMDb movies`)
  } else if (movieIds && movieIds.length > 0) {
    idsToScrape = movieIds
  } else {
    console.error('❌ Error: No IMDB IDs provided. Use --ids or --use-failed-list')
    process.exit(1)
  }

  // Apply limit if specified
  const toScrape = limit ? idsToScrape.slice(0, limit) : idsToScrape
  console.log(`📊 Will attempt to scrape ${toScrape.length} posters`)

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No downloads will be performed\n')
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

  console.log('\n🚀 Starting scrape process...\n')
  console.log('⚠️  Note: IMDB scraping uses a 1 second delay between requests to be respectful\n')

  const startTime = Date.now()
  const successfulIds: string[] = []

  // Process each IMDB ID
  for (const movieId of toScrape) {
    const success = await scrapePoster(movieId, stats)
    if (success && fs.existsSync(join(POSTERS_DIR, `${movieId}.jpg`))) {
      successfulIds.push(movieId)
    }

    // Rate limiting delay (be respectful to IMDB)
    if (stats.attempted < stats.total) {
      await sleep(delayMs)
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  // Update failed-posters.json if we used the failed list
  if (useFailedList && successfulIds.length > 0) {
    console.log(
      `\n📝 Updating failed-posters.json to remove ${successfulIds.length} successful downloads...`
    )
    const failedDownloads: FailedDownload[] = JSON.parse(
      fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
    )
    const successSet = new Set(successfulIds)
    const updatedFailures = failedDownloads.filter(f => !successSet.has(f.movieId))
    fs.writeFileSync(FAILED_DOWNLOADS_FILE, JSON.stringify(updatedFailures, null, 2))
    console.log(
      `✅ Updated failed-posters.json (${failedDownloads.length} → ${updatedFailures.length})`
    )
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SCRAPE SUMMARY')
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
    console.log('\n❌ Errors:')
    stats.errors.forEach(e => {
      console.log(`  ${e.movieId}: ${e.error}`)
    })
  } else if (stats.errors.length > 10) {
    console.log(`\n❌ ${stats.errors.length} errors occurred (showing first 10):`)
    stats.errors.slice(0, 10).forEach(e => {
      console.log(`  ${e.movieId}: ${e.error}`)
    })
  }

  console.log('\n✨ Done!\n')
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: {
  movieIds?: string[]
  limit?: number
  delayMs?: number
  dryRun?: boolean
  useFailedList?: boolean
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
  } else if (arg === '--dry-run') {
    options.dryRun = true
  } else if (arg === '--use-failed-list') {
    options.useFailedList = true
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: pnpm tsx scripts/scrape-imdb-posters.ts [options]

Scrape poster images directly from IMDB movie pages.

Options:
  --ids <ids>          Comma-separated list of IMDB IDs (e.g., tt0151916,tt0068646)
  --use-failed-list    Use the failed-posters.json file as source
  --limit <n>          Only scrape the first N posters (default: all)
  --delay <ms>         Delay between requests in milliseconds (default: 1000)
  --dry-run            Show what would be done without actually downloading
  --help, -h           Show this help message

Examples:
  pnpm tsx scripts/scrape-imdb-posters.ts --ids tt0151916,tt0068646
  pnpm tsx scripts/scrape-imdb-posters.ts --use-failed-list --limit 10
  pnpm tsx scripts/scrape-imdb-posters.ts --use-failed-list --limit 10 --dry-run
  pnpm tsx scripts/scrape-imdb-posters.ts --ids tt0151916 --delay 2000
`)
    process.exit(0)
  }
}

// Run the script
scrapeImdbPosters(options).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
