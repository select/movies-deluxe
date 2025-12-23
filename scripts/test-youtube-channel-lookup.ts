#!/usr/bin/env tsx
/**
 * Test script for YouTube channel lookup improvements
 * Tests that channel IDs, handles, and search terms all work correctly
 */

import { Client } from 'youtubei'
import { fetchChannelVideos } from '../server/utils/youtube'

const TEST_CASES = [
  {
    name: 'Channel ID (UC format)',
    identifier: 'UCOg0aMAXmF3o5m243PxhE5g',
    description: 'Should use getChannel() directly',
  },
  {
    name: 'Channel Handle',
    identifier: '@publicdomainmovies',
    description: 'Should search for handle',
  },
  {
    name: 'Search Term',
    identifier: 'public domain movies',
    description: 'Should search by keyword',
  },
]

async function testChannelLookup() {
  console.log('🧪 Testing YouTube Channel Lookup\n')

  const youtube = new Client()

  for (const testCase of TEST_CASES) {
    console.log(`\n📋 Test: ${testCase.name}`)
    console.log(`   Input: "${testCase.identifier}"`)
    console.log(`   Expected: ${testCase.description}`)

    try {
      const videos = await fetchChannelVideos(youtube, testCase.identifier, 1, false)

      if (videos && videos.length > 0) {
        console.log(`   ✅ SUCCESS - Found channel with ${videos.length} video(s)`)
        console.log(`      First video: "${videos[0].title}"`)
      } else {
        console.log(`   ⚠️  WARNING - Channel found but no videos`)
      }
    } catch (error) {
      console.log(`   ❌ FAILED - ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log('\n✨ Test complete!')
}

// Run tests
testChannelLookup().catch(console.error)
