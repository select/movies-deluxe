import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MovieEntry } from '../../../../shared/types/movie'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const dbStats = getDatabaseStats(db)

  // Fetch Archive.org total (feature_films collection as default)
  let archiveTotal = 0
  try {
    const archiveRes = await fetch(
      'https://archive.org/advancedsearch.php?q=mediatype:movies+AND+collection:feature_films&rows=0&output=json'
    )
    const archiveData = await archiveRes.json()
    archiveTotal = archiveData.response.numFound
  } catch (e) {
    console.error('Failed to fetch Archive.org total', e)
  }

  // Poster stats
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )
  const postersDir = join(process.cwd(), 'public/posters')
  let totalWithPosterUrl = 0
  let totalDownloaded = 0
  entries.forEach(movie => {
    const posterUrl = movie.metadata?.Poster || movie.metadata?.poster
    if (posterUrl && posterUrl !== 'N/A') {
      totalWithPosterUrl++
      const filepath = join(postersDir, `${movie.imdbId}.jpg`)
      if (existsSync(filepath)) {
        totalDownloaded++
      }
    }
  })

  // For YouTube, we'd need to iterate channels, but for now let's return db stats + archive total
  return {
    database: dbStats,
    external: {
      archiveOrg: {
        total: archiveTotal,
        scraped: dbStats.archiveOrgSources,
        percent: archiveTotal > 0 ? (dbStats.archiveOrgSources / archiveTotal) * 100 : 0,
      },
    },
    curation: {
      total: dbStats.total,
      curated: dbStats.curatedCount,
      percent: dbStats.total > 0 ? (dbStats.curatedCount / dbStats.total) * 100 : 0,
    },
    omdb: {
      total: dbStats.total,
      matched: dbStats.matched,
      unmatched: dbStats.unmatched,
      percent: dbStats.total > 0 ? (dbStats.matched / dbStats.total) * 100 : 0,
    },
    posters: {
      totalMovies: entries.length,
      withPosterUrl: totalWithPosterUrl,
      downloaded: totalDownloaded,
      missing: totalWithPosterUrl - totalDownloaded,
      percent: totalWithPosterUrl > 0 ? (totalDownloaded / totalWithPosterUrl) * 100 : 0,
    },
  }
})
