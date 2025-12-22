import { Client } from 'youtubei'
import { loadMoviesDatabase, saveMoviesDatabase, upsertMovie } from '../../../utils/movieData'
import { fetchChannelVideos, processYouTubeVideo } from '../../../utils/youtube'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { channels, limit = 50, skipOmdb = false } = body
  const omdbApiKey = process.env.OMDB_API_KEY

  const db = await loadMoviesDatabase()
  const youtube = new Client()

  // Load channel configs for language lookup
  const configPath = resolve(process.cwd(), 'config/youtube-channels.json')
  let channelConfigs: Array<{ id: string; enabled: boolean; language?: string }> = []
  try {
    const configData = readFileSync(configPath, 'utf-8')
    channelConfigs = JSON.parse(configData).channels
  } catch (e) {
    console.error('Failed to load youtube-channels.json', e)
  }
  const channelConfigMap = new Map(channelConfigs.map(c => [c.id, c]))

  const results = {
    processed: 0,
    added: 0,
    updated: 0,
    errors: [] as string[],
  }

  const channelsToProcess = channels || channelConfigs.filter(c => c.enabled).map(c => c.id)

  for (const channelId of channelsToProcess) {
    try {
      const channelConfig = channelConfigMap.get(channelId)
      const videos = await fetchChannelVideos(youtube, channelId, limit)

      for (const video of videos) {
        try {
          const entry = await processYouTubeVideo(video, channelConfig, { skipOmdb, omdbApiKey })
          if (entry) {
            const existing = db[entry.imdbId]
            upsertMovie(db, entry.imdbId, entry)
            if (existing) results.updated++
            else results.added++
            results.processed++
          }
        } catch (e: unknown) {
          results.errors.push(
            `Failed to process ${video.title}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (e: unknown) {
      results.errors.push(
        `Failed to process channel ${channelId}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  await saveMoviesDatabase(db)
  return results
})
