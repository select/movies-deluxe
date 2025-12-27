import * as fs from 'node:fs'
import { join } from 'node:path'

const FAILED_YOUTUBE_FILE = join(process.cwd(), 'public/data/failed-youtube.json')

export type FailureReason = 'shorts' | 'duration' | 'trailer_clip' | 'missing_data' | 'api_error'

export interface FailedYouTubeVideo {
  videoId: string
  channelId: string
  title: string
  reason: FailureReason
  duration?: number
  failedAt: string
  lastAttempt: string
}

/**
 * Load failed YouTube videos from disk
 */
export function loadFailedYouTubeVideos(): FailedYouTubeVideo[] {
  try {
    if (fs.existsSync(FAILED_YOUTUBE_FILE)) {
      const data = fs.readFileSync(FAILED_YOUTUBE_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load failed YouTube videos:', error)
  }
  return []
}

/**
 * Save failed YouTube video to disk
 */
export function saveFailedYouTubeVideo(
  video: Omit<FailedYouTubeVideo, 'failedAt' | 'lastAttempt'>
): void {
  try {
    const dataDir = join(process.cwd(), 'public/data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    const failed = loadFailedYouTubeVideos()
    const now = new Date().toISOString()

    const existingIndex = failed.findIndex(f => f.videoId === video.videoId)
    if (existingIndex >= 0) {
      failed[existingIndex] = {
        ...failed[existingIndex]!,
        ...video,
        lastAttempt: now,
      }
    } else {
      failed.push({
        ...video,
        failedAt: now,
        lastAttempt: now,
      })
    }

    fs.writeFileSync(FAILED_YOUTUBE_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to save failed YouTube video:', err)
  }
}

/**
 * Check if video has previously failed
 */
export function hasFailedYouTubeVideo(videoId: string): boolean {
  const failed = loadFailedYouTubeVideos()
  return failed.some(f => f.videoId === videoId)
}

/**
 * Remove from failed YouTube videos (successful retry)
 */
export function removeFailedYouTubeVideo(videoId: string): void {
  try {
    if (!fs.existsSync(FAILED_YOUTUBE_FILE)) return

    let failed = loadFailedYouTubeVideos()
    failed = failed.filter(f => f.videoId !== videoId)
    fs.writeFileSync(FAILED_YOUTUBE_FILE, JSON.stringify(failed, null, 2))
  } catch (err) {
    console.error('Failed to remove from failed YouTube videos:', err)
  }
}

/**
 * Get failed videos for a specific channel
 */
export function getFailedVideosByChannel(channelId: string): FailedYouTubeVideo[] {
  return loadFailedYouTubeVideos().filter(f => f.channelId === channelId)
}
