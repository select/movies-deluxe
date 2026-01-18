import * as fs from 'node:fs'
import { join } from 'node:path'

const LIST_URL = 'https://letterboxd.com/jbutts15/list/the-complete-criterion-collection/'
const OUTPUT_FILE = join(process.cwd(), 'data/criterion-collection.json')
const CACHE_FILE = join(process.cwd(), 'data/criterion-cache.json')
const DELAY_MS = 1500

interface Cache {
  [movieUrl: string]: string | null // movieUrl -> movieId
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchHtml(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      if (!response.ok) {
        if (response.status === 429) {
          const wait = (i + 1) * 5000
          console.warn(`  ⚠️ Rate limited (429). Waiting ${wait / 1000}s before retry...`)
          await sleep(wait)
          continue
        }
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
      }
      return await response.text()
    } catch (error) {
      if (i === retries - 1) throw error
      const wait = (i + 1) * 2000
      console.warn(
        `  ⚠️ Fetch error: ${error instanceof Error ? error.message : error}. Retrying in ${wait / 1000}s...`
      )
      await sleep(wait)
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`)
}

function extractMovieUrls(html: string): string[] {
  const regex = /data-item-link="(\/film\/[^/"]*\/)"/g
  const urls: string[] = []
  let match
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) {
      urls.push(`https://letterboxd.com${match[1]}`)
    }
  }
  return [...new Set(urls)]
}

function extractImdbId(html: string): string | null {
  const regex = /imdb\.com\/title\/(tt\d+)/
  const match = html.match(regex)
  return match ? match[1] : null
}

function extractTotalPages(html: string): number {
  const regex = /page\/(\d+)\//g
  let maxPage = 1
  let match
  while ((match = regex.exec(html)) !== null) {
    const page = parseInt(match[1], 10)
    if (page > maxPage) maxPage = page
  }
  return maxPage
}

async function main() {
  console.log('🚀 Starting Criterion Collection scraper...')

  let cache: Cache = {}
  if (fs.existsSync(CACHE_FILE)) {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    console.log(`📦 Loaded ${Object.keys(cache).length} items from cache`)
  }

  try {
    const mainHtml = await fetchHtml(LIST_URL)
    const totalPages = extractTotalPages(mainHtml)
    console.log(`📄 Found ${totalPages} pages in the list`)

    const allMovieUrls: string[] = []

    for (let i = 1; i <= totalPages; i++) {
      console.log(`🔍 Processing list page ${i}/${totalPages}...`)
      const pageUrl = i === 1 ? LIST_URL : `${LIST_URL}page/${i}/`
      const pageHtml = await fetchHtml(pageUrl)
      const urls = extractMovieUrls(pageHtml)
      allMovieUrls.push(...urls)
      console.log(`✅ Found ${urls.length} movies on page ${i}`)
      await sleep(DELAY_MS)
    }

    const uniqueMovieUrls = [...new Set(allMovieUrls)]
    console.log(`🎬 Total unique movies to process: ${uniqueMovieUrls.length}`)

    const args = process.argv.slice(2)
    const limitArg = args.find(arg => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : uniqueMovieUrls.length

    const moviesToProcess = uniqueMovieUrls.slice(0, limit)
    if (limit < uniqueMovieUrls.length) {
      console.log(`⚠️ Limiting to first ${limit} movies for this run`)
    }

    const movieIds: string[] = []

    for (let i = 0; i < moviesToProcess.length; i++) {
      const movieUrl = moviesToProcess[i]

      if (cache[movieUrl]) {
        if (cache[movieUrl] !== 'NOT_FOUND') {
          movieIds.push(cache[movieUrl]!)
        }
        continue
      }

      console.log(`🍿 [${i + 1}/${uniqueMovieUrls.length}] Scraping: ${movieUrl}`)
      try {
        const movieHtml = await fetchHtml(movieUrl)
        const movieId = extractImdbId(movieHtml)

        if (movieId) {
          console.log(`  ✨ Found IMDB ID: ${movieId}`)
          movieIds.push(movieId)
          cache[movieUrl] = movieId
        } else {
          console.warn(`  ⚠️ No IMDB ID found for: ${movieUrl}`)
          cache[movieUrl] = 'NOT_FOUND'
        }
      } catch (error) {
        console.error(
          `  ❌ Error scraping ${movieUrl}:`,
          error instanceof Error ? error.message : error
        )
      }

      // Save cache periodically
      if (i % 10 === 0) {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
      }

      await sleep(DELAY_MS)
    }

    // Final save
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))

    const finalImdbIds = [...new Set(movieIds)].sort()
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalImdbIds, null, 2))

    console.log('\n' + '='.repeat(40))
    console.log('📊 SCRAPE COMPLETE')
    console.log('='.repeat(40))
    console.log(`Total movies found:  ${uniqueMovieUrls.length}`)
    console.log(`IMDB IDs extracted: ${finalImdbIds.length}`)
    console.log(`Output saved to:    ${OUTPUT_FILE}`)
    console.log('='.repeat(40))
  } catch (error) {
    console.error('💥 Fatal error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
