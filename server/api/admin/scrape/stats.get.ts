import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { MovieEntry, YouTubeSource } from '../../../../shared/types/movie'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const dbStats = getDatabaseStats(db)

  // Load channel configs
  const configPath = resolve(process.cwd(), 'config/youtube-channels.json')
  let channelConfigs: Array<{ id: string; name: string; enabled: boolean }> = []
  try {
    const configData = readFileSync(configPath, 'utf-8')
    channelConfigs = JSON.parse(configData).channels
  } catch (e) {
    console.error('Failed to load youtube-channels.json', e)
  }

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

  // Poster stats and YouTube channel stats
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  const youtubeChannelStats = channelConfigs.map(config => ({
    id: config.id,
    name: config.name,
    enabled: config.enabled,
    scraped: 0,
    total: 0, // We don't have total per channel easily without extra API calls
  }))

  const postersDir = join(process.cwd(), 'public/posters')
  let totalWithPosterUrl = 0
  let totalDownloaded = 0

  entries.forEach(movie => {
    // Poster stats
    const posterUrl = movie.metadata?.Poster
    if (posterUrl && posterUrl !== 'N/A') {
      totalWithPosterUrl++
      const filepath = join(postersDir, `${movie.imdbId}.jpg`)
      if (existsSync(filepath)) {
        totalDownloaded++
      }
    }

    // YouTube channel stats
    movie.sources?.forEach(source => {
      if (source.type === 'youtube') {
        const youtubeSource = source as YouTubeSource
        // Match by channelId or channelName (prefixed with @)
        const stats = youtubeChannelStats.find(
          s => s.id === youtubeSource.channelId || s.id === `@${youtubeSource.channelName}`
        )
        if (stats) {
          stats.scraped++
        }
      }
    })
  })

  return {
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
  }
})
