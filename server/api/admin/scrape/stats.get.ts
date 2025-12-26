import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from 'youtubei'
import { loadFailedYouTubeVideos } from '../../utils/failedYoutube'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const dbStats = await getDatabaseStats(db)
  const youtube = new Client()

  // Load failed YouTube videos for stats
  const failedVideos = loadFailedYouTubeVideos()

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

  // Fetch YouTube totals for each channel
  const youtubeChannelStats = await Promise.all(
    dbStats.youtubeChannels.map(async channelStat => {
      let total = 0
      try {
        total = await getChannelVideoCount(youtube, channelStat.id)
      } catch (e) {
        console.error(`Failed to fetch total for channel ${channelStat.id}`, e)
      }

      const failedCount = failedVideos.filter(f => f.channelId === channelStat.id).length
      const totalProcessed = channelStat.scraped + failedCount

      return {
        ...channelStat,
        total,
        failed: failedCount,
        failureRate: totalProcessed > 0 ? (failedCount / totalProcessed) * 100 : 0,
      }
    })
  )

  // Poster stats
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const postersDir = join(process.cwd(), 'public/posters')

  // Get all poster files in the directory
  let posterFiles: string[] = []
  if (existsSync(postersDir)) {
    const { readdirSync } = await import('fs')
    posterFiles = readdirSync(postersDir).filter(f => f.endsWith('.jpg'))
  }

  // Count posters that match movies in the database
  const posterImdbIds = new Set(posterFiles.map(f => f.replace('.jpg', '')))
  const movieImdbIds = new Set(entries.map(m => m.imdbId))
  const matchedPosters = Array.from(posterImdbIds).filter(id => movieImdbIds.has(id))

  let totalWithPosterUrl = 0
  let totalDownloaded = 0

  entries.forEach(movie => {
    const posterUrl = movie.metadata?.Poster
    if (posterUrl && posterUrl !== 'N/A') {
      totalWithPosterUrl++
      if (posterImdbIds.has(movie.imdbId)) {
        totalDownloaded++
      }
    }
  })

  const stats = {
    database: dbStats,
    external: {
      archiveOrg: {
        total: archiveTotal,
        scraped: dbStats.archiveOrgSources,
        percent: archiveTotal > 0 ? (dbStats.archiveOrgSources / archiveTotal) * 100 : 0,
      },
      youtube: {
        channels: youtubeChannelStats,
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
      percentOfMoviesWithUrl:
        totalWithPosterUrl > 0 ? (totalDownloaded / totalWithPosterUrl) * 100 : 0,
      percentOfAllMovies: entries.length > 0 ? (matchedPosters.length / entries.length) * 100 : 0,
      filesInDirectory: posterFiles.length,
      matchedPosters: matchedPosters.length,
    },
    lastUpdated: new Date().toISOString(),
  }

  // Save to public/data/stats.json
  try {
    const dataDir = resolve(process.cwd(), 'public/data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    writeFileSync(join(dataDir, 'stats.json'), JSON.stringify(stats, null, 2))
  } catch (e) {
    console.error('Failed to save stats.json', e)
  }

  return stats
})
