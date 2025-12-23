import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from 'youtubei'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const dbStats = await getDatabaseStats(db)
  const youtube = new Client()

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

      return {
        ...channelStat,
        total,
      }
    })
  )

  // Poster stats
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const postersDir = join(process.cwd(), 'public/posters')
  let totalWithPosterUrl = 0
  let totalDownloaded = 0

  entries.forEach(movie => {
    const posterUrl = movie.metadata?.Poster
    if (posterUrl && posterUrl !== 'N/A') {
      totalWithPosterUrl++
      const filepath = join(postersDir, `${movie.imdbId}.jpg`)
      if (existsSync(filepath)) {
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
      percent: totalWithPosterUrl > 0 ? (totalDownloaded / totalWithPosterUrl) * 100 : 0,
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
