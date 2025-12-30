import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { join } from 'node:path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const FAILED_DOWNLOADS_FILE = join(process.cwd(), 'public/data/failed-posters.json')
const POSTERS_DIR = join(process.cwd(), 'public/posters')

interface FailedDownload {
  imdbId: string
  url: string
  failedAt: string
  error: string
}

interface RetryStats {
  total: number
  attempted: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{ imdbId: string; error: string }>
}

/**
 * Download image from URL to filepath
 */
function downloadImage(url: string, filepath: string, timeout: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const request = client.get(url, response => {
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
 * Retry downloading a single poster using OMDB Poster API
 */
async function retryPoster(imdbId: string, apiKey: string, stats: RetryStats): Promise<boolean> {
  const filepath = join(POSTERS_DIR, `${imdbId}.jpg`)

  // Skip if poster already exists
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
    stats.skipped++
    return true
  }

  // Construct OMDB Poster API URL
  const omdbPosterUrl = `http://img.omdbapi.com/?apikey=${apiKey}&i=${imdbId}`

  try {
    stats.attempted++
    await downloadImage(omdbPosterUrl, filepath)
    stats.successful++
    console.log(`✅ [${stats.attempted}/${stats.total}] Successfully downloaded: ${imdbId}`)
    return true
  } catch (error) {
    stats.failed++
    const errorMsg = error instanceof Error ? error.message : String(error)
    stats.errors.push({ imdbId, error: errorMsg })
    console.error(`❌ [${stats.attempted}/${stats.total}] Failed: ${imdbId} - ${errorMsg}`)
    return false
  }
}

/**
 * Main function to retry all failed posters
 */
async function retryFailedPosters(options: { limit?: number; delayMs?: number; dryRun?: boolean }) {
  const { limit, delayMs = 250, dryRun = false } = options

  // Check for API key
  const apiKey = process.env.OMDB_API_KEY
  if (!apiKey || apiKey === 'your_omdb_api_key_here') {
    console.error('❌ Error: OMDB_API_KEY not found in environment variables')
    console.error('Please set OMDB_API_KEY in your .env file')
    process.exit(1)
  }

  // Ensure posters directory exists
  if (!fs.existsSync(POSTERS_DIR)) {
    fs.mkdirSync(POSTERS_DIR, { recursive: true })
  }

  // Load failed downloads
  if (!fs.existsSync(FAILED_DOWNLOADS_FILE)) {
    console.error('❌ Error: No failed posters file found at:', FAILED_DOWNLOADS_FILE)
    process.exit(1)
  }

  const failedDownloads: FailedDownload[] = JSON.parse(
    fs.readFileSync(FAILED_DOWNLOADS_FILE, 'utf-8')
  )

  console.log(`\n📊 Found ${failedDownloads.length} failed poster downloads`)

  // Filter to only IMDb IDs (skip archive and youtube sources)
  const imdbFailures = failedDownloads.filter(f => f.imdbId.startsWith('tt'))
  console.log(`📊 ${imdbFailures.length} are IMDb movies (can use OMDB Poster API)`)

  // Apply limit if specified
  const toRetry = limit ? imdbFailures.slice(0, limit) : imdbFailures
  console.log(`📊 Will attempt to retry ${toRetry.length} posters`)

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No downloads will be performed\n')
    console.log('Sample URLs that would be tried:')
    toRetry.slice(0, 5).forEach(f => {
      console.log(`  ${f.imdbId}: http://img.omdbapi.com/?apikey=[KEY]&i=${f.imdbId}`)
    })
    return
  }

  // Initialize stats
  const stats: RetryStats = {
    total: toRetry.length,
    attempted: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  console.log('\n🚀 Starting retry process...\n')

  const startTime = Date.now()
  const successfulIds: string[] = []

  // Process each failed poster
  for (const failed of toRetry) {
    const success = await retryPoster(failed.imdbId, apiKey, stats)
    if (success && fs.existsSync(join(POSTERS_DIR, `${failed.imdbId}.jpg`))) {
      successfulIds.push(failed.imdbId)
    }

    // Rate limiting delay
    if (stats.attempted < stats.total) {
      await sleep(delayMs)
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  // Update failed-posters.json to remove successful downloads
  if (successfulIds.length > 0) {
    console.log(
      `\n📝 Updating failed-posters.json to remove ${successfulIds.length} successful downloads...`
    )
    const successSet = new Set(successfulIds)
    const updatedFailures = failedDownloads.filter(f => !successSet.has(f.imdbId))
    fs.writeFileSync(FAILED_DOWNLOADS_FILE, JSON.stringify(updatedFailures, null, 2))
    console.log(
      `✅ Updated failed-posters.json (${failedDownloads.length} → ${updatedFailures.length})`
    )
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 RETRY SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total failed posters:     ${failedDownloads.length}`)
  console.log(`IMDb posters (eligible):  ${imdbFailures.length}`)
  console.log(`Attempted:                ${stats.attempted}`)
  console.log(
    `Successful:               ${stats.successful} (${((stats.successful / stats.attempted) * 100).toFixed(1)}%)`
  )
  console.log(`Failed:                   ${stats.failed}`)
  console.log(`Skipped (already exist):  ${stats.skipped}`)
  console.log(`Duration:                 ${duration}s`)
  console.log('='.repeat(60))

  if (stats.errors.length > 0 && stats.errors.length <= 10) {
    console.log('\n❌ Errors:')
    stats.errors.forEach(e => {
      console.log(`  ${e.imdbId}: ${e.error}`)
    })
  } else if (stats.errors.length > 10) {
    console.log(`\n❌ ${stats.errors.length} errors occurred (showing first 10):`)
    stats.errors.slice(0, 10).forEach(e => {
      console.log(`  ${e.imdbId}: ${e.error}`)
    })
  }

  console.log('\n✨ Done!\n')
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: { limit?: number; delayMs?: number; dryRun?: boolean } = {}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1]!, 10)
    i++
  } else if (arg === '--delay' && args[i + 1]) {
    options.delayMs = parseInt(args[i + 1]!, 10)
    i++
  } else if (arg === '--dry-run') {
    options.dryRun = true
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: pnpm tsx scripts/retry-failed-posters-omdb.ts [options]

Retry downloading failed posters using the OMDB Poster API.

Options:
  --limit <n>      Only retry the first N failed posters (default: all)
  --delay <ms>     Delay between requests in milliseconds (default: 250)
  --dry-run        Show what would be done without actually downloading
  --help, -h       Show this help message

Examples:
  pnpm tsx scripts/retry-failed-posters-omdb.ts
  pnpm tsx scripts/retry-failed-posters-omdb.ts --limit 100
  pnpm tsx scripts/retry-failed-posters-omdb.ts --limit 10 --dry-run
  pnpm tsx scripts/retry-failed-posters-omdb.ts --delay 500
`)
    process.exit(0)
  }
}

// Run the script
retryFailedPosters(options).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
