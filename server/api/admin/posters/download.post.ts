import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineEventHandler, readBody } from 'h3'
import { loadMoviesDatabase } from '#server/utils/loadMoviesDatabase'
import type { MovieEntry } from '#shared/types/movie'
import { loadFailedPosterIds, downloadPoster } from '#server/utils/posterDownloader'
import { emitProgress } from '#server/utils/progress'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { limit = 50, force = false } = body

  const db = await loadMoviesDatabase()
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry =>
      typeof entry === 'object' && entry !== null && 'movieId' in entry
  )

  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  }

  const postersDir = join(process.cwd(), 'public/posters')

  // Load failed posters once at the start
  const failedPosters = force ? new Set<string>() : loadFailedPosterIds()

  // Filter pipeline (functional composition)
  const toProcess = entries
    .filter(movie => movie.movieId.startsWith('tt')) // Has IMDB ID (required for scraping fallback)
    .filter(movie => {
      if (force) return true
      const filepath = join(postersDir, `${movie.movieId}.jpg`)
      return !existsSync(filepath) // Not already downloaded
    })
    .filter(movie => !failedPosters.has(movie.movieId)) // Not previously failed
    .slice(0, limit) // Take only limit items

  const total = toProcess.length
  const startTime = Date.now()

  let count = 0
  for (const movie of toProcess) {
    const elapsedSec = (Date.now() - startTime) / 1000
    const rate = count > 0 && elapsedSec > 0.5 ? Number((count / elapsedSec).toFixed(1)) : 0
    const remaining = rate > 0 && total > count ? Math.round((total - count) / rate) : undefined

    emitProgress({
      type: 'posters',
      status: 'in_progress',
      message: `Downloading poster for: ${movie.title}`,
      current: count,
      total,
      successCurrent: results.successful,
      failedCurrent: results.failed + results.skipped,
      embeddingsPerSecond: rate || undefined,
      estimatedTimeRemaining: remaining,
    })

    try {
      const success = await downloadPoster(movie.movieId, force)
      if (success) {
        results.successful++
      } else {
        results.skipped++
      }
      results.processed++
      count++
    } catch (e: unknown) {
      results.failed++
      results.processed++
      count++
      results.errors.push(
        `Error downloading poster for ${movie.movieId}: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    // Small delay to be nice to the server
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  emitProgress({
    type: 'posters',
    status: 'completed',
    current: count,
    total: count,
    successCurrent: results.successful,
    failedCurrent: results.failed + results.skipped,
    message: 'Poster download completed',
  })

  return results
})
