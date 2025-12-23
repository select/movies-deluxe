import { Client } from 'youtubei'

const youtube = new Client()

const mcmChannels = [
  { id: 'UCsOqLb9_cPFIBKt1eJi8Jew', name: 'MCM TV2' },
  { id: 'UCFLFBgLw0k0UunPGYe1Jeeg', name: 'MCMTV' },
  { id: 'UCnTmW70EmR_pzp_kPmQrZ0g', name: 'MCM TV' },
]

async function checkMCMChannels() {
  console.log('Checking MCM channels for movie content...\n')

  for (const channelInfo of mcmChannels) {
    try {
      console.log(`Checking: ${channelInfo.name} (${channelInfo.id})`)
      const channel = await youtube.getChannel(channelInfo.id)
      console.log(`  Name: ${channel.name}`)
      console.log(`  Handle: ${channel.handle || 'unknown'}`)
      console.log(`  Videos: ${channel.videoCount || 'unknown'}`)

      // Get some videos
      const videos = await channel.videos.next()
      if (videos && videos.length > 0) {
        console.log(`  Sample videos:`)
        for (let i = 0; i < Math.min(3, videos.length); i++) {
          const video = videos[i]
          console.log(`    - ${video.title} (${video.duration || 'unknown'})`)
        }
      } else {
        console.log(`  No videos found`)
      }
      console.log()
    } catch (error) {
      console.error(`  Error: ${error}`)
      console.log()
    }
  }
}

checkMCMChannels()
