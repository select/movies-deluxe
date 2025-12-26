import dotenv from 'dotenv'
import { getChannelVideoIds, getChannelVideoCount } from '../server/utils/youtubeDataApi'

// Load environment variables
dotenv.config()

const TEST_CHANNEL_ID = 'UC8IHAQMuiJdY6ALuhG7iU8Q' // FilmRise Movies
const EXPECTED_VIDEO_COUNT = 446

async function testYouTubeDataApi() {
  console.log('Testing YouTube Data API v3 implementation')
  console.log('='.repeat(80))
  console.log(`Channel: FilmRise Movies (${TEST_CHANNEL_ID})`)
  console.log(`Expected: ${EXPECTED_VIDEO_COUNT} videos\n`)

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.error('❌ ERROR: YOUTUBE_API_KEY environment variable is not set')
    console.error('\nPlease set your API key:')
    console.error('  export YOUTUBE_API_KEY=your_api_key_here')
    console.error('\nOr add it to .env file:')
    console.error('  YOUTUBE_API_KEY=your_api_key_here')
    console.error('\nGet an API key from:')
    console.error('  https://console.cloud.google.com/apis/credentials')
    process.exit(1)
  }

  try {
    // TEST 1: Get channel video count
    console.log('📊 TEST 1: Get Channel Video Count')
    console.log('-'.repeat(80))
    const startInfo = Date.now()
    const videoCount = await getChannelVideoCount(apiKey, TEST_CHANNEL_ID)
    const infoTime = ((Date.now() - startInfo) / 1000).toFixed(1)

    console.log(`✓ Video count: ${videoCount}`)
    console.log(`✓ Fetched in ${infoTime}s\n`)

    // TEST 2: Get all video IDs
    console.log('📹 TEST 2: Get All Video IDs')
    console.log('-'.repeat(80))
    const startIds = Date.now()
    const videoIds = await getChannelVideoIds(apiKey, TEST_CHANNEL_ID)
    const idsTime = ((Date.now() - startIds) / 1000).toFixed(1)

    console.log(`✓ Total video IDs fetched: ${videoIds.length}`)
    console.log(`✓ Fetched in ${idsTime}s\n`)

    // TEST 3: Verification
    console.log('✅ TEST 3: Verification')
    console.log('-'.repeat(80))
    console.log(`Expected videos: ${EXPECTED_VIDEO_COUNT}`)
    console.log(`Fetched videos: ${videoIds.length}`)

    const coverage = ((videoIds.length / EXPECTED_VIDEO_COUNT) * 100).toFixed(1)
    console.log(`Coverage: ${coverage}%`)

    if (videoIds.length >= EXPECTED_VIDEO_COUNT) {
      console.log('✅ SUCCESS: All videos fetched!')
    } else {
      console.log(`⚠️  WARNING: Missing ${EXPECTED_VIDEO_COUNT - videoIds.length} videos`)
    }

    // Show sample video IDs
    console.log('\n📝 Sample Video IDs:')
    console.log('-'.repeat(80))
    const sampleIds = videoIds.slice(0, 5)
    sampleIds.forEach((id, index) => {
      console.log(`  ${index + 1}. ${id} (https://www.youtube.com/watch?v=${id})`)
    })
    if (videoIds.length > 5) {
      console.log(`  ... and ${videoIds.length - 5} more`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ All tests completed successfully!')
    console.log('='.repeat(80))
  } catch (error) {
    console.error('\n❌ TEST FAILED')
    console.error('-'.repeat(80))
    console.error('Error:', error)

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.error('\n💡 Tip: Check your API key is valid and YouTube Data API v3 is enabled')
      } else if (error.message.includes('quota')) {
        console.error('\n💡 Tip: You may have exceeded your daily API quota (10,000 units)')
      }
    }

    process.exit(1)
  }
}

// Run the test
testYouTubeDataApi()
