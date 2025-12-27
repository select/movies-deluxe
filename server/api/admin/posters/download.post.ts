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

  // Load failed posters once at the start
  const failedPosters = force ? new Set<string>() : loadFailedPosterIds()

  // Filter pipeline (functional composition)
  const toProcess = entries
    .filter(movie => movie.metadata) // Has OMDB metadata
    .filter(movie => {
      const posterUrl = movie.metadata!.Poster
      return posterUrl && posterUrl !== 'N/A' // Valid poster URL
    })
    .filter(movie => {
      if (force) return true
      const filepath = join(postersDir, `${movie.imdbId}.jpg`)
      return !existsSync(filepath) // Not already downloaded
    })
    .filter(movie => !failedPosters.has(movie.imdbId)) // Not previously failed
    .slice(0, limit) // Take only limit items

  const total = toProcess.length

  let count = 0
  for (const movie of toProcess) {
    emitProgress({
      type: 'posters',
      status: 'in_progress',
      message: `Downloading poster for: ${movie.title}`,
      current: count,
      total,
    })

    const posterUrl = movie.metadata!.Poster as string

    try {
      const success = await downloadPoster(posterUrl, movie.imdbId, force, [])
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
