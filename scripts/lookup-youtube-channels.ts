import { Client } from 'youtubei'

const youtube = new Client()

const channelsToVerify = [
  { id: 'UCE34fwgW7kWr7tc7YiOWtRw', name: 'PizzaFlix' },
  { id: 'UCT6gOjzXtqeb_oE-wZVHlFA', name: 'Public Domain Movies - Classic Old Movies' },
  { id: 'UCWlLgwn2nfjnefINARfcquA', name: 'Timeless Classic Films' },
  { id: 'UCgLqpXqmEJoyDYE_lpY1DXg', name: 'Colorized Public Domain' },
]

async function verifyChannels() {
  console.log('Verifying YouTube channels...\n')

  for (const channelInfo of channelsToVerify) {
    try {
      console.log(`Checking: ${channelInfo.name}`)
      const channel = await youtube.getChannel(channelInfo.id)

      if (channel) {
        console.log(`  ✓ Name: ${channel.name}`)
        console.log(`  ID: ${channel.id}`)
        console.log(`  Videos: ${channel.videoCount || 'unknown'}`)
        console.log(`  Handle: ${channel.handle || 'unknown'}`)
        console.log()
      } else {
        console.log(`  ✗ Channel not found`)
        console.log()
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error}`)
      console.log()
    }
  }
}

verifyChannels()
