import { downloadPoster } from '../server/utils/posterDownloader'
import { unlinkSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function testImdbFallback() {
  const testId = 'tt0151916'
  const posterPath = join(process.cwd(), 'public/posters', `${testId}.jpg`)

  // Check if OMDB API key is set
  const hasOmdbKey =
    process.env.OMDB_API_KEY && process.env.OMDB_API_KEY !== 'your_omdb_api_key_here'
  console.log(`OMDB API Key: ${hasOmdbKey ? '✅ Set' : '❌ Not set'}`)

  // Remove existing poster if it exists
  if (existsSync(posterPath)) {
    unlinkSync(posterPath)
    console.log(`🗑️  Removed existing poster for ${testId}`)
  }

  console.log(`\n🧪 Testing poster download for ${testId}...`)
  console.log(`Expected flow: ${hasOmdbKey ? 'OMDB API → IMDB scraping' : 'IMDB scraping only'}\n`)

  const result = await downloadPoster(testId, true)

  console.log('\n' + '='.repeat(60))
  if (result) {
    console.log('✅ SUCCESS: Poster downloaded successfully!')
    console.log(`📁 File: ${posterPath}`)
    if (existsSync(posterPath)) {
      const stats = statSync(posterPath)
      console.log(`📊 Size: ${(stats.size / 1024).toFixed(2)} KB`)
    }
  } else {
    console.log('❌ FAILED: Could not download poster')
  }
  console.log('='.repeat(60))
}

testImdbFallback().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
