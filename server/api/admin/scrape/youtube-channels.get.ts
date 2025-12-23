import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

export default defineEventHandler(async () => {
  const configPath = resolve(process.cwd(), 'config/youtube-channels.json')
  try {
    const configData = readFileSync(configPath, 'utf-8')
    return JSON.parse(configData)
  } catch (e) {
    console.error('Failed to load youtube-channels.json', e)
    return { channels: [] }
  }
})
