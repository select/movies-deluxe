import { loadMoviesDatabase } from '../../../utils/movieData'
import { downloadPoster } from '../../../utils/posterDownloader'
import type { MovieEntry } from '../../../../shared/types/movie'
import { emitProgress } from '../../../utils/progress'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { limit = 50, force = false } = body

  const db = await loadMoviesDatabase()
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  }

  // Filter movies that have a poster URL
  const toProcess = entries.filter(movie => {
    const posterUrl = movie.metadata?.Poster
    return posterUrl && posterUrl !== 'N/A'
  })

  const total = Math.min(toProcess.length, limit)

  let count = 0
  for (const movie of toProcess) {
    if (count >= limit) break

    emitProgress({
      type: 'posters',
      status: 'in_progress',
      message: `Downloading poster for: ${movie.title}`,
      current: count,
      total,
    })

    const posterUrl = movie.metadata?.Poster as string

    try {
      const success = await downloadPoster(posterUrl, movie.imdbId, force)
      if (success) {
        results.successful++
      } else {
        results.failed++
        results.errors.push(`Failed to download poster for ${movie.imdbId}`)
      }
      results.processed++
      count++
    } catch (e: unknown) {
      results.failed++
      results.errors.push(
        `Error downloading poster for ${movie.imdbId}: ${e instanceof Error ? e.message : String(e)}`
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
    message: 'Poster download completed',
  })

  return results
})
