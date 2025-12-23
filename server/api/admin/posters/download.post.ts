import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

  const postersDir = join(process.cwd(), 'public/posters')

  // Filter movies that have a poster URL and don't have a downloaded poster yet
  const toProcess = entries.filter(movie => {
    const posterUrl = movie.metadata?.Poster
    if (!posterUrl || posterUrl === 'N/A') return false

    // Skip if already downloaded (unless force)
    if (!force) {
      const filepath = join(postersDir, `${movie.imdbId}.jpg`)
      if (existsSync(filepath)) {
        return false
      }
    }

    return true
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
        results.skipped++
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
