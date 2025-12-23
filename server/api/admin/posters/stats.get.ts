import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadMoviesDatabase } from '../../../utils/movieData'
import type { MovieEntry } from '../../../../shared/types/movie'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const postersDir = join(process.cwd(), 'public/posters')

  let totalWithPosterUrl = 0
  let totalDownloaded = 0
  const missingPosters: string[] = []

  entries.forEach(movie => {
    const posterUrl = movie.metadata?.Poster
    if (posterUrl && posterUrl !== 'N/A') {
      totalWithPosterUrl++
      const filepath = join(postersDir, `${movie.imdbId}.jpg`)
      if (existsSync(filepath)) {
        totalDownloaded++
      } else {
        missingPosters.push(movie.imdbId)
      }
    }
  })

  return {
    totalMovies: entries.length,
    withPosterUrl: totalWithPosterUrl,
    downloaded: totalDownloaded,
    missing: missingPosters.length,
    percent: totalWithPosterUrl > 0 ? (totalDownloaded / totalWithPosterUrl) * 100 : 0,
    missingIds: missingPosters.slice(0, 100), // Return first 100 missing IDs for reference
  }
})
