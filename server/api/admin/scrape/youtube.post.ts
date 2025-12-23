import { Client } from 'youtubei'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { channels } = body

  const results = {
    processed: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
    channels: [] as Array<{
      id: string
      processed: number
      added: number
      updated: number
      skipped: number
    }>,
  }

  const db = await loadMoviesDatabase()
  const youtube = new Client()

  // Load channel configs for language lookup
  const configPath = resolve(process.cwd(), 'config/youtube-channels.json')
  let channelConfigs: Array<{ id: string; enabled: boolean; language?: string; name: string }> = []
  try {
    const configData = readFileSync(configPath, 'utf-8')
    channelConfigs = JSON.parse(configData).channels
  } catch (e) {
    console.error('Failed to load youtube-channels.json', e)
  }
  const channelConfigMap = new Map(channelConfigs.map(c => [c.id, c]))

  const channelsToProcess = channels || channelConfigs.filter(c => c.enabled).map(c => c.id)

  for (const channelId of channelsToProcess) {
    const channelResult = { id: channelId, processed: 0, added: 0, updated: 0, skipped: 0 }
    results.channels.push(channelResult)

    const channelConfig = channelConfigMap.get(channelId)
    const channelName = channelConfig?.name || channelId

    try {
      // Get total video count for progress tracking
      const totalVideos = await getChannelVideoCount(youtube, channelId)

      await fetchChannelVideos(
        youtube,
        channelId,
        db,
        channelConfig,
        async (video, isNew) => {
          // Process callback - called for each video after page is fetched
          if (isNew) {
            if (isNew === 'added') {
              results.added++
              channelResult.added++
            } else {
              results.updated++
              channelResult.updated++
            }
          } else {
            results.skipped++
            channelResult.skipped++
          }
          results.processed++
          channelResult.processed++

          emitProgress({
            type: 'youtube',
            status: 'in_progress',
            message: `[${channelName}] ${video.title}`,
            current: results.processed,
            total: totalVideos || results.processed,
          })
        },
        async () => {
          // Save callback - called after each page
          await saveMoviesDatabase(db)
        }
      )
    } catch (e: unknown) {
      results.errors.push(
        `Failed to process channel ${channelId}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  await saveMoviesDatabase(db)

  emitProgress({
    type: 'youtube',
    status: 'completed',
    current: results.processed,
    total: results.processed,
    message: 'YouTube scrape completed',
  })

  return results
})
