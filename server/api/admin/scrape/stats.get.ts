import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from 'youtubei'
import { loadMoviesDatabase, getDatabaseStats } from '../../../utils/movieData'
import type { MovieEntry, YouTubeSource } from '../../../../shared/types/movie'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const dbStats = getDatabaseStats(db)
  const youtube = new Client()

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

  // Fetch YouTube totals
  const youtubeChannelStats = await Promise.all(
    channelConfigs.map(async config => {
      let total = 0
      try {
        const searchQuery = config.id.startsWith('@') ? config.id.slice(1) : config.id
        const searchResults = await youtube.search(searchQuery, { type: 'channel' })
        const channelResult = searchResults.items[0]
        if (channelResult) {
          const channel = await (youtube as any).getChannel(channelResult.id)
          if (channel) {
            const countStr = ((channel as any).videoCount as string) || ''
            // Parse "2.8K videos" or "150 videos" or "1,234 videos"
            const match = countStr.replace(/,/g, '').match(/([\d.]+)\s*([KM])?/)
            if (match && match[1]) {
              total = parseFloat(match[1])
              if (match[2] === 'K') total *= 1000
              if (match[2] === 'M') total *= 1000000
              total = Math.floor(total)
            }
          }
        }
      } catch (e) {
        console.error(`Failed to fetch total for channel ${config.id}`, e)
      }

      return {
        id: config.id,
        name: config.name,
        enabled: config.enabled,
        scraped: 0,
        total,
      }
    })
  )

  // Poster stats and YouTube channel stats
  const entries = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

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
