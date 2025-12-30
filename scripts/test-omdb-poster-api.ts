import * as dotenv from 'dotenv'
import { downloadPoster } from '../server/utils/posterDownloader'

// Load environment variables
dotenv.config()

/**
 * Test script to verify OMDB Poster API integration
 */
async function testOmdbPosterApi() {
  console.log('🧪 Testing OMDB Poster API integration...\n')

  // Check for API key
  const apiKey = process.env.OMDB_API_KEY
  if (!apiKey || apiKey === 'your_omdb_api_key_here') {
    console.error('❌ Error: OMDB_API_KEY not found in environment variables')
    console.error('Please set OMDB_API_KEY in your .env file')
    process.exit(1)
  }

  console.log('✅ OMDB API key found\n')

  // Test cases: movies with known good posters
  const testCases = [
    {
      imdbId: 'tt0111161', // The Shawshank Redemption
      name: 'The Shawshank Redemption',
      omdbUrl:
        'https://m.media-amazon.com/images/M/MV5BNDE3ODcxYzMtY2YzZC00NmNlLWJiNDMtZDViZWM2MzIxZDYwXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_SX300.jpg',
    },
    {
      imdbId: 'tt0068646', // The Godfather
      name: 'The Godfather',
      omdbUrl:
        'https://m.media-amazon.com/images/M/MV5BM2MyNjYxNmUtYTAwNi00MTYxLWJmNWYtYzZlODY3ZTk3OTFlXkEyXkFqcGdeQXVyNzkwMjQ5NzM@._V1_SX300.jpg',
    },
  ]

  console.log('Testing with 2 well-known movies:\n')

  let successCount = 0
  let failCount = 0

  for (const testCase of testCases) {
    console.log(`📥 Testing: ${testCase.name} (${testCase.imdbId})`)

    try {
      // The downloadPoster function should now try OMDB Poster API first
      const success = await downloadPoster(testCase.omdbUrl, testCase.imdbId, true, [])

      if (success) {
        console.log(`   ✅ Successfully downloaded poster\n`)
        successCount++
      } else {
        console.log(`   ❌ Failed to download poster\n`)
        failCount++
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}\n`)
      failCount++
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  console.log('='.repeat(60))
  console.log('📊 TEST RESULTS')
  console.log('='.repeat(60))
  console.log(`Total tests:  ${testCases.length}`)
  console.log(`Successful:   ${successCount}`)
  console.log(`Failed:       ${failCount}`)
  console.log('='.repeat(60))

  if (successCount === testCases.length) {
    console.log('\n✨ All tests passed! OMDB Poster API integration is working.\n')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.\n')
    process.exit(1)
  }
}

// Run the test
testOmdbPosterApi().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
