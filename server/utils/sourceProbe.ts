import { google, type youtube_v3 } from 'googleapis'
import type { Innertube } from 'youtubei.js'
import type {
  SourceStatus,
  SourceUnavailableReason,
  YouTubeRegionRestriction,
} from '../../shared/types/movie'

export interface SourceProbeResult {
  sourceId: string
  platform: 'youtube' | 'archive.org'
  status: SourceStatus
  unavailableReason?: SourceUnavailableReason
  unavailableDetail?: string
  regionRestriction?: YouTubeRegionRestriction
  checkedAt: number
  stage?: 1 | 2 | 'skipped'
}

export interface ProbeYouTubeOptions {
  apiKey?: string
  youtube?: Innertube
  stage2DelayMs?: number
  stage1BatchDelayMs?: number
  skipStage2?: boolean
  onProgress?: (current: number, total: number) => void
}

export interface ProbeArchiveOptions {
  delayMs?: number
  expectedCollection?: string
  onProgress?: (current: number, total: number) => void
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract readable text from youtubei.js Text / Run / ErrorScreen objects
 */
function extractText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (Array.isArray(obj.runs)) {
      return obj.runs
        .map(r =>
          r && typeof r === 'object' ? String((r as Record<string, unknown>).text || '') : ''
        )
        .join('')
        .trim()
    }
    if (typeof obj.toString === 'function' && obj.toString !== Object.prototype.toString) {
      const str = obj.toString()
      if (str && str !== '[object Object]') return str
    }
  }
  return ''
}

/**
 * Classify a YouTube Stage 2 playability_status payload into normalized status + reason
 */
export function classifyYouTubePlayability(playability: {
  status?: string
  reason?: unknown
  error_screen?: unknown
}): {
  status: SourceStatus
  unavailableReason?: SourceUnavailableReason
  unavailableDetail?: string
} {
  const rawStatus = (playability.status || '').toUpperCase()
  const reasonText = extractText(playability.reason)

  let screenReason = ''
  let screenSubreason = ''
  if (playability.error_screen && typeof playability.error_screen === 'object') {
    const screen = playability.error_screen as Record<string, unknown>
    screenReason = extractText(screen.reason)
    screenSubreason = extractText(screen.subreason)
  }

  const combinedDetail = [rawStatus, reasonText, screenReason, screenSubreason]
    .filter(Boolean)
    .join(' | ')
  const lower = combinedDetail.toLowerCase()

  if (rawStatus === 'OK') {
    return { status: 'active' }
  }

  if (
    /\bage[\s-]?restricted\b/i.test(combinedDetail) ||
    lower.includes('sign in to confirm your age') ||
    lower.includes('inappropriate for some users')
  ) {
    return {
      status: 'unavailable',
      unavailableReason: 'age_restricted',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (lower.includes('private video') || lower.includes('this video is private')) {
    return {
      status: 'unavailable',
      unavailableReason: 'private',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (lower.includes('copyright') || lower.includes('blocked it on copyright grounds')) {
    return {
      status: 'unavailable',
      unavailableReason: 'copyright_takedown',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (
    lower.includes('terminated') ||
    lower.includes('account associated with this video') ||
    lower.includes('uploader closed')
  ) {
    return {
      status: 'unavailable',
      unavailableReason: 'channel_terminated',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (
    lower.includes('terms of service') ||
    lower.includes('community guidelines') ||
    lower.includes('violating youtube') ||
    lower.includes('policy')
  ) {
    return {
      status: 'unavailable',
      unavailableReason: 'tos_violation',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (
    lower.includes('members-only') ||
    lower.includes('members only') ||
    lower.includes('join this channel') ||
    lower.includes('channel members')
  ) {
    return {
      status: 'unavailable',
      unavailableReason: 'members_only',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (
    lower.includes('not available in your country') ||
    lower.includes('made this video available in your country')
  ) {
    return {
      status: 'unavailable',
      unavailableReason: 'geo_blocked_all',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  if (
    lower.includes('removed by the uploader') ||
    lower.includes('has been removed') ||
    lower.includes('no longer available') ||
    lower.includes('video unavailable')
  ) {
    return {
      status: 'unavailable',
      unavailableReason: 'deleted',
      unavailableDetail: combinedDetail || undefined,
    }
  }

  return {
    status: 'unavailable',
    unavailableReason: 'unavailable_unknown',
    unavailableDetail: combinedDetail || 'Unknown playability error',
  }
}

/**
 * Classify a YouTube Data API v3 Video resource (Stage 1)
 */
export function classifyYouTubeApiVideo(
  video: youtube_v3.Schema$Video,
  checkedAt = Math.floor(Date.now() / 1000)
): SourceProbeResult {
  const videoId = video.id || ''
  const status = video.status
  const contentDetails = video.contentDetails

  const regionRestriction: YouTubeRegionRestriction | undefined = contentDetails?.regionRestriction
    ? {
        allowed: contentDetails.regionRestriction.allowed || undefined,
        blocked: contentDetails.regionRestriction.blocked || undefined,
      }
    : undefined

  // Truly dead / private states first
  if (status?.privacyStatus === 'private') {
    return {
      sourceId: videoId,
      platform: 'youtube',
      status: 'unavailable',
      unavailableReason: 'private',
      unavailableDetail: 'privacyStatus: private',
      regionRestriction,
      checkedAt,
      stage: 1,
    }
  }

  if (status?.uploadStatus === 'deleted') {
    return {
      sourceId: videoId,
      platform: 'youtube',
      status: 'unavailable',
      unavailableReason: 'deleted',
      unavailableDetail: 'uploadStatus: deleted',
      regionRestriction,
      checkedAt,
      stage: 1,
    }
  }

  if (status?.uploadStatus === 'rejected' || status?.uploadStatus === 'failed') {
    return {
      sourceId: videoId,
      platform: 'youtube',
      status: 'unavailable',
      unavailableReason: 'unavailable_unknown',
      unavailableDetail: `uploadStatus: ${status.uploadStatus}${status.rejectionReason ? ` (${status.rejectionReason})` : ''}`,
      regionRestriction,
      checkedAt,
      stage: 1,
    }
  }

  // Link-out-only states (kept visible on public site per product decision #3)
  if (status?.embeddable === false) {
    return {
      sourceId: videoId,
      platform: 'youtube',
      status: 'unavailable',
      unavailableReason: 'not_embeddable',
      unavailableDetail: 'embeddable: false',
      regionRestriction,
      checkedAt,
      stage: 1,
    }
  }

  if (contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') {
    return {
      sourceId: videoId,
      platform: 'youtube',
      status: 'unavailable',
      unavailableReason: 'age_restricted',
      unavailableDetail: 'ytRating: ytAgeRestricted',
      regionRestriction,
      checkedAt,
      stage: 1,
    }
  }

  // Unlisted (still playable via embed & direct link)
  if (status?.privacyStatus === 'unlisted') {
    return {
      sourceId: videoId,
      platform: 'youtube',
      status: 'unlisted',
      unavailableReason: 'unlisted',
      unavailableDetail: 'privacyStatus: unlisted',
      regionRestriction,
      checkedAt,
      stage: 1,
    }
  }

  return {
    sourceId: videoId,
    platform: 'youtube',
    status: 'active',
    regionRestriction,
    checkedAt,
    stage: 1,
  }
}

/**
 * Probe YouTube videos in 2 stages:
 * - Stage 1: Data API v3 videos.list (50 IDs/call)
 * - Stage 2: youtubei.js getBasicInfo (rate-limited ~250ms) ONLY for Stage 1 misses
 */
export async function probeYouTubeSources(
  videoIds: string[],
  options: ProbeYouTubeOptions = {}
): Promise<Map<string, SourceProbeResult>> {
  const results = new Map<string, SourceProbeResult>()
  const uniqueIds = [...new Set(videoIds.filter(Boolean))]
  if (uniqueIds.length === 0) return results

  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY
  const stage2Queue: string[] = []
  const now = Math.floor(Date.now() / 1000)

  // Stage 1: Data API v3 batched 50 IDs/call
  if (apiKey) {
    const yt = google.youtube({ version: 'v3', auth: apiKey })
    const batchSize = 50
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize)
      try {
        const response = await yt.videos.list({
          part: ['status', 'contentDetails', 'snippet'],
          id: batch,
        })

        const items = response.data.items || []
        const foundIds = new Set<string>()

        for (const video of items) {
          if (!video.id) continue
          foundIds.add(video.id)
          results.set(video.id, classifyYouTubeApiVideo(video, now))
        }

        // Omitted from items[] -> queue for Stage 2
        for (const id of batch) {
          if (!foundIds.has(id)) {
            stage2Queue.push(id)
          }
        }
      } catch (error) {
        console.error(`[SourceProbe] Stage 1 batch error:`, error)
        // Queue batch for Stage 2 fallback if Stage 1 failed
        stage2Queue.push(...batch)
      }

      options.onProgress?.(Math.min(i + batch.length, uniqueIds.length), uniqueIds.length)

      if (i + batchSize < uniqueIds.length) {
        await sleep(options.stage1BatchDelayMs ?? 100)
      }
    }
  } else {
    // No API key -> queue all for Stage 2 if youtubei.js is available
    stage2Queue.push(...uniqueIds)
  }

  // Stage 2: youtubei.js getBasicInfo ONLY for Stage 1 misses
  if (stage2Queue.length > 0 && !options.skipStage2) {
    let youtube = options.youtube
    if (!youtube) {
      const { Innertube } = await import('youtubei.js')
      youtube = await Innertube.create()
    }

    const delayMs = options.stage2DelayMs ?? 250
    for (let i = 0; i < stage2Queue.length; i++) {
      const videoId = stage2Queue[i]!
      const checkedAt = Math.floor(Date.now() / 1000)

      try {
        const info = await youtube.getBasicInfo(videoId)
        const playability = info?.playability_status as
          | { status?: string; reason?: unknown; error_screen?: unknown }
          | undefined

        if (!playability) {
          results.set(videoId, {
            sourceId: videoId,
            platform: 'youtube',
            status: 'unavailable',
            unavailableReason: 'deleted',
            unavailableDetail: 'No playability_status returned by youtubei.js',
            checkedAt,
            stage: 2,
          })
        } else {
          const classified = classifyYouTubePlayability(playability)
          results.set(videoId, {
            sourceId: videoId,
            platform: 'youtube',
            status: classified.status,
            unavailableReason: classified.unavailableReason,
            unavailableDetail: classified.unavailableDetail,
            checkedAt,
            stage: 2,
          })
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        const lower = msg.toLowerCase()
        let reason: SourceUnavailableReason = 'unavailable_unknown'
        if (lower.includes('private')) reason = 'private'
        else if (
          lower.includes('deleted') ||
          lower.includes('not found') ||
          lower.includes('404')
        ) {
          reason = 'deleted'
        }

        results.set(videoId, {
          sourceId: videoId,
          platform: 'youtube',
          status: 'unavailable',
          unavailableReason: reason,
          unavailableDetail: msg,
          checkedAt,
          stage: 2,
        })
      }

      options.onProgress?.(results.size, uniqueIds.length)

      if (i + 1 < stage2Queue.length) {
        await sleep(delayMs)
      }
    }
  } else if (stage2Queue.length > 0) {
    for (const videoId of stage2Queue) {
      results.set(videoId, {
        sourceId: videoId,
        platform: 'youtube',
        status: 'unavailable',
        unavailableReason: 'unavailable_unknown',
        unavailableDetail: 'Omitted from YouTube Data API response (Stage 2 skipped)',
        checkedAt: now,
        stage: 'skipped',
      })
    }
  }

  return results
}

/**
 * Classify an Archive.org /metadata/<identifier> JSON response
 */
export function classifyArchiveMetadata(
  identifier: string,
  data: Record<string, unknown> | null,
  httpStatus: number,
  expectedCollection = 'feature_films',
  checkedAt = Math.floor(Date.now() / 1000)
): SourceProbeResult {
  if (httpStatus === 404 || !data || Object.keys(data).length === 0) {
    return {
      sourceId: identifier,
      platform: 'archive.org',
      status: 'unavailable',
      unavailableReason: 'deleted',
      unavailableDetail: httpStatus === 404 ? 'HTTP 404' : 'Empty metadata response {}',
      checkedAt,
    }
  }

  if (data.is_dark === true) {
    const darkReason =
      typeof data.dark_reason === 'string' && data.dark_reason ? data.dark_reason : 'is_dark: true'
    return {
      sourceId: identifier,
      platform: 'archive.org',
      status: 'unavailable',
      unavailableReason: 'archive_dark',
      unavailableDetail: darkReason,
      checkedAt,
    }
  }

  const metadata = (
    data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
  ) as Record<string, unknown>
  const rawCollections = metadata.collection
  const collections: string[] = Array.isArray(rawCollections)
    ? rawCollections.map(c => String(c))
    : typeof rawCollections === 'string'
      ? [rawCollections]
      : []

  if (!collections.includes(expectedCollection)) {
    return {
      sourceId: identifier,
      platform: 'archive.org',
      status: 'unlisted',
      unavailableReason: 'delisted_from_collection',
      unavailableDetail: `Collections: ${collections.join(', ') || '(none)'}`,
      checkedAt,
    }
  }

  return {
    sourceId: identifier,
    platform: 'archive.org',
    status: 'active',
    checkedAt,
  }
}

/**
 * Probe Archive.org items via https://archive.org/metadata/<identifier>
 */
export async function probeArchiveSources(
  identifiers: string[],
  options: ProbeArchiveOptions = {}
): Promise<Map<string, SourceProbeResult>> {
  const results = new Map<string, SourceProbeResult>()
  const uniqueIds = [...new Set(identifiers.filter(Boolean))]
  if (uniqueIds.length === 0) return results

  const delayMs = options.delayMs ?? 200
  const expectedCollection = options.expectedCollection ?? 'feature_films'

  for (let i = 0; i < uniqueIds.length; i++) {
    const identifier = uniqueIds[i]!
    const checkedAt = Math.floor(Date.now() / 1000)

    try {
      const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)
      if (response.status === 404) {
        results.set(
          identifier,
          classifyArchiveMetadata(identifier, null, 404, expectedCollection, checkedAt)
        )
      } else if (!response.ok) {
        results.set(identifier, {
          sourceId: identifier,
          platform: 'archive.org',
          status: 'unavailable',
          unavailableReason: 'unavailable_unknown',
          unavailableDetail: `HTTP ${response.status}: ${response.statusText}`,
          checkedAt,
        })
      } else {
        const data = (await response.json()) as Record<string, unknown>
        results.set(
          identifier,
          classifyArchiveMetadata(identifier, data, response.status, expectedCollection, checkedAt)
        )
      }
    } catch (error) {
      results.set(identifier, {
        sourceId: identifier,
        platform: 'archive.org',
        status: 'unavailable',
        unavailableReason: 'unavailable_unknown',
        unavailableDetail: error instanceof Error ? error.message : String(error),
        checkedAt,
      })
    }

    options.onProgress?.(i + 1, uniqueIds.length)

    if (i + 1 < uniqueIds.length) {
      await sleep(delayMs)
    }
  }

  return results
}
