/**
 * Test script to verify IMDB ID redirect handling
 *
 * This script tests the poster downloader's ability to:
 * 1. Detect IMDB ID redirects
 * 2. Migrate movie data to new ID
 * 3. Rename poster files
 * 4. Update collections
 */

import { downloadPoster } from '../server/utils/posterDownloader'
import { loadMoviesDatabase } from '../server/utils/movieData'
import type { MovieEntry } from '../shared/types/movie'

async function testImdbRedirect() {
  console.log('Testing IMDB ID redirect handling...\n')

  // Test with a known redirected ID (tt1144469)
  const oldId = 'tt1144469'

  console.log(`Attempting to download poster for ${oldId}`)
  console.log('This ID is known to redirect to a different IMDB ID\n')

  // Load database before
  const dbBefore = await loadMoviesDatabase()
  const entryBefore = dbBefore[oldId]

  if (entryBefore) {
    console.log(`Movie found in database before:`)
    console.log(`  Title: ${entryBefore.title}`)
    console.log(`  Movie ID: ${entryBefore.movieId}\n`)
  } else {
    console.log(`Movie ${oldId} not found in database\n`)
  }

  // Try to download poster (this should trigger redirect detection)
  const success = await downloadPoster(oldId, true)

  console.log(`\nDownload result: ${success ? 'SUCCESS' : 'FAILED'}`)

  // Load database after
  const dbAfter = await loadMoviesDatabase()
  const entryAfter = dbAfter[oldId]

  if (!entryAfter) {
    console.log(`\nMovie ${oldId} no longer in database (migrated)`)

    // Try to find the new ID
    const entries = Object.entries(dbAfter).filter(([key]) => !key.startsWith('_'))
    for (const [key, entry] of entries) {
      const movieEntry = entry as MovieEntry
      if (movieEntry.sources?.some(s => s.id === oldId)) {
        console.log(`Found migrated movie at new ID: ${key}`)
        console.log(`  Title: ${movieEntry.title}`)
        console.log(`  Movie ID: ${movieEntry.movieId}`)
        break
      }
    }
  } else {
    console.log(`\nMovie still at ${oldId}`)
    console.log(`  Title: ${entryAfter.title}`)
    console.log(`  Movie ID: ${entryAfter.movieId}`)
  }
}

testImdbRedirect().catch(console.error)
