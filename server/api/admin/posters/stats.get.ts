import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const postersDir = join(process.cwd(), 'public/posters')

  // Get all poster files in the directory
  let posterFiles: string[] = []
  if (existsSync(postersDir)) {
    posterFiles = readdirSync(postersDir).filter(f => f.endsWith('.jpg'))
  }

  // Count posters that match movies in the database
  const posterImdbIds = new Set(posterFiles.map(f => f.replace('.jpg', '')))
  const movieImdbIds = new Set(entries.map(m => m.imdbId))

  const matchedPosters = Array.from(posterImdbIds).filter(id => movieImdbIds.has(id))
  const orphanedPosters = Array.from(posterImdbIds).filter(id => !movieImdbIds.has(id))

  let totalWithPosterUrl = 0
  let totalDownloaded = 0
  const missingPosters: string[] = []

  entries.forEach(movie => {
    const posterUrl = movie.metadata?.Poster
    if (posterUrl && posterUrl !== 'N/A') {
      totalWithPosterUrl++
      if (posterImdbIds.has(movie.imdbId)) {
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
    percentOfMoviesWithUrl:
      totalWithPosterUrl > 0 ? (totalDownloaded / totalWithPosterUrl) * 100 : 0,
    percentOfAllMovies: entries.length > 0 ? (matchedPosters.length / entries.length) * 100 : 0,
    filesInDirectory: posterFiles.length,
    matchedPosters: matchedPosters.length,
    orphanedPosters: orphanedPosters.length,
    missingIds: missingPosters.slice(0, 100), // Return first 100 missing IDs for reference
    orphanedIds: orphanedPosters.slice(0, 20), // Return first 20 orphaned IDs for reference
  }
})
