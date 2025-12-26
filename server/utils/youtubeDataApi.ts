import type { youtube_v3 } from 'googleapis'
import { google } from 'googleapis'

/**
 * YouTube Data API v3 helper for fetching video IDs
 * Used to get complete list of video IDs from a channel
 * Individual video details are still fetched using youtubei.js
 */

export interface YouTubeDataApiConfig {
  apiKey: string
}

export class YouTubeDataApi {
  private youtube: youtube_v3.Youtube

  constructor(config: YouTubeDataApiConfig) {
    this.youtube = google.youtube({
      version: 'v3',
      auth: config.apiKey,
    })
  }

  /**
   * Get all video IDs from a channel's uploads playlist
   * This method paginates through ALL videos (no 154 video limit like youtubei.js)
   *
   * @param channelId - YouTube channel ID (starts with UC)
   * @returns Array of video IDs
   */
  async getChannelVideoIds(channelId: string): Promise<string[]> {
    // Convert channel ID to uploads playlist ID (UC -> UU)
    const uploadsPlaylistId = channelId.replace(/^UC/, 'UU')

    const videoIds: string[] = []
    let nextPageToken: string | undefined
    let pageNum = 0

    console.log(`Fetching all video IDs from uploads playlist: ${uploadsPlaylistId}`)

    do {
      pageNum++
      const response = await this.youtube.playlistItems.list({
        part: ['contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: 50, // Max allowed by API
        pageToken: nextPageToken,
      })

      const items = response.data.items || []
      for (const item of items) {
        const videoId = item.contentDetails?.videoId
        if (videoId) {
          videoIds.push(videoId)
        }
      }

      nextPageToken = response.data.nextPageToken || undefined
      console.log(
        `  Page ${pageNum}: ${items.length} videos (total: ${videoIds.length})${nextPageToken ? ', continuing...' : ''}`
      )
    } while (nextPageToken)

    console.log(`✓ Total video IDs fetched: ${videoIds.length}`)
    return videoIds
  }

  /**
   * Get channel information
   */
  async getChannel(channelId: string): Promise<youtube_v3.Schema$Channel | null> {
    const response = await this.youtube.channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [channelId],
    })

    return response.data.items?.[0] || null
  }
}

/**
 * Get all video IDs from a channel using YouTube Data API v3
 *
 * @param apiKey - YouTube Data API v3 key
 * @param channelId - YouTube channel ID (starts with UC)
 * @returns Array of video IDs
 */
export async function getChannelVideoIds(apiKey: string, channelId: string): Promise<string[]> {
  const api = new YouTubeDataApi({ apiKey })
  return api.getChannelVideoIds(channelId)
}

/**
 * Get channel video count using Data API v3
 */
export async function getChannelVideoCount(apiKey: string, channelId: string): Promise<number> {
  try {
    const api = new YouTubeDataApi({ apiKey })
    const channel = await api.getChannel(channelId)

    if (channel?.statistics?.videoCount) {
      return parseInt(channel.statistics.videoCount)
    }
  } catch (e) {
    console.error(`Failed to fetch video count for channel ${channelId}`, e)
  }
  return 0
}
