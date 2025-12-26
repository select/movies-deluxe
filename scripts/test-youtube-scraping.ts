import dotenv from 'dotenv'
import { Innertube } from 'youtubei.js'
import { getChannelVideoIds } from '../server/utils/youtubeDataApi'

// Load environment variables
dotenv.config()

const TEST_CHANNEL_ID = 'UC8IHAQMuiJdY6ALuhG7iU8Q' // FilmRise Movies
const MAX_VIDEOS_TO_TEST = 3 // Only test first 3 videos

async function testYouTubeScraping() {
  console.log('Testing YouTube Scraping End-to-End')
  console.log('='.repeat(80))
  console.log(`Channel: FilmRise Movies (${TEST_CHANNEL_ID})`)
  console.log(`Testing first ${MAX_VIDEOS_TO_TEST} videos\n`)

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.error('❌ ERROR: YOUTUBE_API_KEY environment variable is not set')
    process.exit(1)
  }

  try {
    // Step 1: Get video IDs using Data API
    console.log('📊 STEP 1: Fetching video IDs from Data API')
    console.log('-'.repeat(80))
    const allVideoIds = await getChannelVideoIds(apiKey, TEST_CHANNEL_ID)
    console.log(`✓ Fetched ${allVideoIds.length} video IDs`)

    const testVideoIds = allVideoIds.slice(0, MAX_VIDEOS_TO_TEST)
    console.log(`✓ Testing first ${testVideoIds.length} videos\n`)

    // Step 2: Create Innertube instance for fetching video details
    console.log('📹 STEP 2: Creating Innertube instance')
    console.log('-'.repeat(80))
    const youtube = await Innertube.create()
    console.log('✓ Innertube instance created\n')

    // Step 3: Fetch video details for each test video
    console.log('🎬 STEP 3: Fetching video details')
    console.log('-'.repeat(80))

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < testVideoIds.length; i++) {
      const videoId = testVideoIds[i]
      console.log(`\nVideo ${i + 1}/${testVideoIds.length}: ${videoId}`)

      try {
        const video = await youtube.getBasicInfo(videoId)

        if (!video || !video.basic_info) {
          console.log('  ❌ Missing video data')
          failCount++
          continue
        }

        const title = video.basic_info.title || 'Unknown'
        const duration = video.basic_info.duration || 0
        const isShort = video.basic_info.is_short || false
        const viewCount = video.basic_info.view_count || 0
        const thumbnail = video.basic_info.thumbnail?.[0]?.url || 'N/A'

        console.log(`  ✓ Title: ${title}`)
        console.log(`  ✓ Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`)
        console.log(`  ✓ Is Short: ${isShort}`)
        console.log(`  ✓ Views: ${viewCount}`)
        console.log(`  ✓ Thumbnail: ${thumbnail ? 'Available' : 'N/A'}`)

        successCount++

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
        failCount++
      }
    }

    // Step 4: Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 TEST SUMMARY')
    console.log('='.repeat(80))
    console.log(`Total videos tested: ${testVideoIds.length}`)
    console.log(`✓ Successful: ${successCount}`)
    console.log(`✗ Failed: ${failCount}`)
    console.log(`Success rate: ${((successCount / testVideoIds.length) * 100).toFixed(1)}%`)

    if (successCount === testVideoIds.length) {
      console.log('\n✅ ALL TESTS PASSED!')
      console.log('YouTube scraping is working correctly.')
      process.exit(0)
    } else {
      console.log('\n⚠️  SOME TESTS FAILED')
      console.log('Please review the errors above.')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ TEST FAILED')
    console.error('-'.repeat(80))
    console.error('Error:', error)
    process.exit(1)
  }
}

// Run the test
testYouTubeScraping()
