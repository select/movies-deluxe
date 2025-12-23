/**
 * Image download and validation utilities
 * Migrated from scripts/utils/imageDownloader.ts
 */

import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { createLogger } from './logger'

const logger = createLogger('ImageDownloader')

export interface DownloadOptions {
  timeout?: number // milliseconds
  maxRetries?: number
  retryDelay?: number // milliseconds
  validateAfter?: boolean
}

export interface DownloadResult {
  success: boolean
  filepath?: string
  error?: string
  size?: number
  format?: string
  retries?: number
}

const DEFAULT_OPTIONS: Required<DownloadOptions> = {
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  validateAfter: true,
}

/**
 * Download an image from URL to filepath with retry logic
 */
export async function downloadImage(
  url: string,
  filepath: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: string = ''

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.debug(`Retry attempt ${attempt} for ${url}`)
        await sleep(opts.retryDelay * attempt) // Exponential backoff
      }

      await downloadImageOnce(url, filepath, opts.timeout)

      // Validate if requested
      if (opts.validateAfter) {
        const isValid = await validateImage(filepath)
        if (!isValid) {
          lastError = 'Image validation failed'
          continue
        }
      }

      const stats = fs.statSync(filepath)
      const format = getImageFormat(filepath)

      return {
        success: true,
        filepath,
        size: stats.size,
        format,
        retries: attempt,
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      logger.debug(`Download attempt ${attempt + 1} failed: ${lastError}`)

      // Clean up partial file
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
    }
  }

  return {
    success: false,
    error: lastError,
    retries: opts.maxRetries,
  }
}

/**
 * Download image once (internal helper)
 */
function downloadImageOnce(url: string, filepath: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const request = client.get(url, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadImageOnce(redirectUrl, filepath, timeout).then(resolve).catch(reject)
          return
        }
      }

      // Check status code
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      // Create write stream
      const fileStream = fs.createWriteStream(filepath)

      response.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close()
        resolve()
      })

      fileStream.on('error', err => {
        fs.unlinkSync(filepath)
        reject(err)
      })
    })

    request.on('error', reject)
    request.setTimeout(timeout, () => {
      request.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

/**
 * Validate that a file is a valid image
 */
export async function validateImage(filepath: string): Promise<boolean> {
  try {
    if (!fs.existsSync(filepath)) {
      return false
    }

    const stats = fs.statSync(filepath)

    // Check file size (should be > 0 and < 10MB)
    if (stats.size === 0 || stats.size > 10 * 1024 * 1024) {
      logger.warn(`Invalid image size: ${stats.size} bytes for ${filepath}`)
      return false
    }

    // Check magic bytes for common image formats
    const buffer = Buffer.alloc(12)
    const fd = fs.openSync(filepath, 'r')
    fs.readSync(fd, buffer, 0, 12, 0)
    fs.closeSync(fd)

    // Check for image signatures
    const isJPEG = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    const isPNG =
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    const isWebP =
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46

    if (!isJPEG && !isPNG && !isWebP && !isGIF) {
      logger.warn(`Invalid image format detected for ${filepath}`)
      return false
    }

    return true
  } catch (error) {
    logger.error(`Error validating image ${filepath}:`, error)
    return false
  }
}

/**
 * Detect image format from file
 */
export function getImageFormat(filepath: string): string | null {
  try {
    if (!fs.existsSync(filepath)) {
      return null
    }

    const buffer = Buffer.alloc(12)
    const fd = fs.openSync(filepath, 'r')
    fs.readSync(fd, buffer, 0, 12, 0)
    fs.closeSync(fd)

    // Check magic bytes
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpg'
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'png'
    }
    if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'webp'
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif'
    }

    return 'unknown'
  } catch (error) {
    logger.error(`Error detecting format for ${filepath}:`, error)
    return null
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if file exists and is valid
 */
export function imageExists(filepath: string): boolean {
  return fs.existsSync(filepath) && fs.statSync(filepath).size > 0
}

/**
 * Get image file size in bytes
 */
export function getImageSize(filepath: string): number | null {
  try {
    if (!fs.existsSync(filepath)) {
      return null
    }
    return fs.statSync(filepath).size
  } catch {
    return null
  }
}

/**
 * Batch download images with progress tracking
 */
export interface BatchDownloadOptions extends DownloadOptions {
  concurrency?: number
  onProgress?: (current: number, total: number, url: string) => void
}

export interface BatchDownloadResult {
  total: number
  successful: number
  failed: number
  skipped: number
  results: Map<string, DownloadResult>
}

export async function batchDownloadImages(
  downloads: Array<{ url: string; filepath: string }>,
  options: BatchDownloadOptions = {}
): Promise<BatchDownloadResult> {
  const concurrency = options.concurrency || 5
  const results = new Map<string, DownloadResult>()
  let completed = 0
  let successful = 0
  let failed = 0
  let skipped = 0

  // Filter out already existing files
  const toDownload = downloads.filter(({ filepath }) => {
    if (imageExists(filepath)) {
      skipped++
      results.set(filepath, { success: true, filepath, size: getImageSize(filepath) || 0 })
      return false
    }
    return true
  })

  // Process in batches
  for (let i = 0; i < toDownload.length; i += concurrency) {
    const batch = toDownload.slice(i, i + concurrency)
    const promises = batch.map(async ({ url, filepath }) => {
      if (options.onProgress) {
        options.onProgress(completed + 1, downloads.length, url)
      }

      const result = await downloadImage(url, filepath, options)
      results.set(filepath, result)

      completed++
      if (result.success) {
        successful++
      } else {
        failed++
      }

      return result
    })

    await Promise.all(promises)
  }

  return {
    total: downloads.length,
    successful: successful + skipped,
    failed,
    skipped,
    results,
  }
}
