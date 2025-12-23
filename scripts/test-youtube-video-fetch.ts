#!/usr/bin/env tsx
/**
 * Test script to debug video fetching from YouTube channel
 */

import { Client } from 'youtubei'

async function testVideoFetch() {
  console.log('🧪 Testing YouTube Video Fetch\n')

  const youtube = new Client()
  const channelId = 'UCOg0aMAXmF3o5m243PxhE5g'

  try {
    console.log(`📋 Fetching channel: ${channelId}`)
    const channel = await youtube.getChannel(channelId)

    if (!channel) {
      console.log('❌ Channel not found')
      return
    }

    console.log(`✅ Channel found: ${channel.name}`)
    console.log(`   ID: ${channel.id}`)
    console.log(`   Videos object exists: ${!!channel.videos}`)

    console.log('\n📹 Fetching first batch of videos...')
    const videoList = await channel.videos.next()

    console.log(`   Videos returned: ${videoList?.length || 0}`)

    if (videoList && videoList.length > 0) {
      const video = videoList[0]
      console.log('\n🎬 First video details:')
      console.log(`   Title: ${video.title}`)
      console.log(`   ID: ${video.id}`)
      console.log(`   Duration: ${video.duration}`)
      console.log(`   Thumbnails type: ${typeof video.thumbnails}`)
      console.log(`   Thumbnails is array: ${Array.isArray(video.thumbnails)}`)
      console.log(`   Thumbnails: ${JSON.stringify(video.thumbnails, null, 2)}`)

      // Try to access thumbnails safely
      if (video.thumbnails) {
        console.log(`\n   Accessing thumbnails:`)
        console.log(`   - thumbnails[0]: ${video.thumbnails[0]?.url || 'undefined'}`)
        console.log(`   - thumbnails[1]: ${video.thumbnails[1]?.url || 'undefined'}`)
        console.log(`   - thumbnails[2]: ${video.thumbnails[2]?.url || 'undefined'}`)
      }
    }
  } catch (error) {
    console.error('❌ Error:', error)
    if (error instanceof Error) {
      console.error('Stack:', error.stack)
    }
  }
}

testVideoFetch().catch(console.error)
