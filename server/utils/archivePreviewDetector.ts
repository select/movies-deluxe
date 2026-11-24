/**
 * Archive.org Preview / Incomplete Upload Detector
 *
 * Combines file size (MB) with known film length (MB/min) so legitimate
 * cartoons and shorts (e.g. 7 min at 35 MB = 5 MB/min) are NEVER falsely
 * flagged as previews, while small-size feature films are caught.
 */

export interface ArchiveSourceSizeInput {
  sourceId: string
  title?: string | null
  description?: string | null
  sizeBytes?: number | null
  runtimeMinutes?: number | null
  durationSeconds?: number | null
}

export interface ArchivePreviewAnalysis {
  isLikelyPreview: boolean
  flags: string[]
  sizeMB: number | null
  runtimeMinutes: number | null
  mbPerMin: number | null
  reason?: string
}

export interface ArchiveVideoLengthResult {
  sourceId: string
  longestVideoSeconds: number | null
  longestVideoMinutes: number | null
  confirmedPreview: boolean
  error?: string
}

const TEN_MB_BYTES = 10 * 1024 * 1024

const VIDEO_EXT_REGEX = /\.(mp4|m4v|ogv|mkv|avi|mpeg|mpg|mov|webm|flv|wmv)$/i
const VIDEO_FORMAT_REGEX = /(mpeg4|h\.264|ogg video|matroska|divx|xvid|quicktime|webm|cinepack)/i

let lastArchiveFetchAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function throttleArchiveRequest(): Promise<void> {
  const now = Date.now()
  const targetDelay = 600 + Math.floor(Math.random() * 401) // 600-1000ms + jitter
  const elapsed = now - lastArchiveFetchAt
  if (elapsed < targetDelay) {
    await sleep(targetDelay - elapsed)
  }
  lastArchiveFetchAt = Date.now()
}

function parseArchiveFileLengthSeconds(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null
  }
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Plain numeric seconds (e.g. "423.50")
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const val = parseFloat(trimmed)
    return Number.isFinite(val) && val > 0 ? val : null
  }

  // HH:MM:SS or MM:SS
  const parts = trimmed.split(':').map(p => parseFloat(p))
  if (parts.some(n => !Number.isFinite(n))) return null
  if (parts.length === 3) {
    const [h = 0, m = 0, s = 0] = parts
    return h * 3600 + m * 60 + s
  }
  if (parts.length === 2) {
    const [m = 0, s = 0] = parts
    return m * 60 + s
  }
  return null
}

/**
 * Analyze an Archive.org source using file size, film length (MB/min), and keywords.
 */
export function analyzeArchiveSourceSize(input: ArchiveSourceSizeInput): ArchivePreviewAnalysis {
  const flags: string[] = []
  const reasons: string[] = []

  const sizeBytes =
    typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes) ? input.sizeBytes : null
  const sizeMB = sizeBytes !== null ? Number((sizeBytes / (1024 * 1024)).toFixed(2)) : null

  const runtimeMinutes =
    typeof input.runtimeMinutes === 'number' &&
    Number.isFinite(input.runtimeMinutes) &&
    input.runtimeMinutes > 0
      ? input.runtimeMinutes
      : typeof input.durationSeconds === 'number' &&
          Number.isFinite(input.durationSeconds) &&
          input.durationSeconds > 0
        ? Number((input.durationSeconds / 60).toFixed(1))
        : null

  const mbPerMin =
    sizeMB !== null && runtimeMinutes !== null && runtimeMinutes > 0
      ? Number((sizeMB / runtimeMinutes).toFixed(2))
      : null

  // 1. Tiny or empty file (< 10 MB or 0 bytes), protecting legitimate ultra-short films (<= 5 min)
  const isLegitUltraShort =
    runtimeMinutes !== null && runtimeMinutes <= 5 && mbPerMin !== null && mbPerMin >= 0.8
  if (sizeBytes !== null && (sizeBytes === 0 || (sizeBytes < TEN_MB_BYTES && !isLegitUltraShort))) {
    flags.push('tiny_or_empty_file')
    reasons.push(`File size is ${sizeMB ?? 0} MB (< 10 MB)`)
  }

  // 2. Size + Film Length check (MB/min)
  if (runtimeMinutes !== null && sizeMB !== null) {
    if (runtimeMinutes >= 50 && (sizeMB < 100 || (mbPerMin !== null && mbPerMin < 1.2))) {
      flags.push('low_mb_per_min_feature')
      reasons.push(
        `Feature film (${runtimeMinutes} min) has ${sizeMB} MB (${mbPerMin ?? 0} MB/min)`
      )
    }
    // Note: Shorts/cartoons (< 30 min) with sizeMB >= 10 are NOT flagged.
  }

  const isLikelyPreview = flags.length > 0

  return {
    isLikelyPreview,
    flags,
    sizeMB,
    runtimeMinutes,
    mbPerMin,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
  }
}

/**
 * Polite Archive.org metadata verifier: fetches https://archive.org/metadata/{sourceId},
 * parses the longest video file's length, and compares against expected runtimeMinutes.
 */
export async function fetchArchiveVideoLength(
  sourceId: string,
  runtimeMinutes?: number | null
): Promise<ArchiveVideoLengthResult> {
  await throttleArchiveRequest()

  try {
    const url = `https://archive.org/metadata/${encodeURIComponent(sourceId)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'MoviesDeluxeAudit/1.0 (+https://movies-deluxe.local)',
      },
    })

    if (!response.ok) {
      return {
        sourceId,
        longestVideoSeconds: null,
        longestVideoMinutes: null,
        confirmedPreview: false,
        error: `HTTP ${response.status}`,
      }
    }

    const data = (await response.json()) as {
      files?: Array<{ name?: string; format?: string; length?: string | number }>
    }

    const files = Array.isArray(data.files) ? data.files : []
    let longestSeconds = 0

    for (const file of files) {
      const name = file.name || ''
      const format = file.format || ''
      const isVideo = VIDEO_EXT_REGEX.test(name) || VIDEO_FORMAT_REGEX.test(format)
      if (!isVideo) continue

      const sec = parseArchiveFileLengthSeconds(file.length)
      if (sec !== null && sec > longestSeconds) {
        longestSeconds = sec
      }
    }

    if (longestSeconds <= 0) {
      return {
        sourceId,
        longestVideoSeconds: null,
        longestVideoMinutes: null,
        confirmedPreview: false,
      }
    }

    const longestMinutes = Number((longestSeconds / 60).toFixed(2))
    const confirmedPreview =
      typeof runtimeMinutes === 'number' &&
      runtimeMinutes > 0 &&
      longestMinutes < runtimeMinutes * 0.35 &&
      longestMinutes < 20

    return {
      sourceId,
      longestVideoSeconds: Math.round(longestSeconds),
      longestVideoMinutes: longestMinutes,
      confirmedPreview,
    }
  } catch (error) {
    return {
      sourceId,
      longestVideoSeconds: null,
      longestVideoMinutes: null,
      confirmedPreview: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
