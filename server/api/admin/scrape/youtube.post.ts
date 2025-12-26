import { Innertube } from 'youtubei.js'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { loadFailedYouTubeVideos } from '../../../utils/failedYoutube'
import { getChannelVideoCount as getChannelVideoCountDataApi } from '../../../utils/youtubeDataApi'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { channels } = body

  const results = {
    processed: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failureReasons: {} as Record<string, number>,
    errors: [] as string[],
    channels: [] as Array<{
      id: string
      processed: number
      added: number
      updated: number
      skipped: number
      failed: number
    }>,
  }

  const db = await loadMoviesDatabase()
  const youtube = await Innertube.create()

  // Load previous failures for stats
  const previousFailures = loadFailedYouTubeVideos()

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
    const channelResult = {
      id: channelId,
      processed: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    }
    results.channels.push(channelResult)

    const channelConfig = channelConfigMap.get(channelId)
    const channelName = channelConfig?.name || channelId

    // Count previous failures for this channel
    const channelPreviousFailures = previousFailures.filter(f => f.channelId === channelId).length

    try {
      // Get total video count for progress tracking using Data API v3
      const youtubeApiKey = process.env.YOUTUBE_API_KEY
      if (!youtubeApiKey) {
        throw new Error(
          'YOUTUBE_API_KEY environment variable is required. Get one from https://console.cloud.google.com/apis/credentials'
        )
      }

      const totalVideos = await getChannelVideoCountDataApi(youtubeApiKey, channelId)

      await fetchChannelVideos(
        youtube,
        channelId,
        db,
        channelConfig,
        async (video, result) => {
          // Process callback - called for each video after page is fetched
          if (result === 'added') {
            results.added++
            channelResult.added++
          } else if (result === 'updated') {
            results.updated++
            channelResult.updated++
          } else if (result === 'already_scraped') {
            results.skipped++
            channelResult.skipped++
          } else {
            // It's a failure reason
            results.failed++
            channelResult.failed++
            results.failureReasons[result] = (results.failureReasons[result] || 0) + 1
          }

          results.processed++
          channelResult.processed++

          emitProgress({
            type: 'youtube',
            status: 'in_progress',
            message: `[${channelName}] ${video.title}`,
            current: results.processed,
            total: totalVideos || results.processed,
            successCurrent: results.added + results.updated,
            successPrevious: 0, // We don't track this globally yet
            failedCurrent: results.failed,
            failedPrevious: channelPreviousFailures,
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
    successCurrent: results.added + results.updated,
    failedCurrent: results.failed,
  })

  return results
})
