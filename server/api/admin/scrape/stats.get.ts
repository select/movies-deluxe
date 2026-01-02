import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getChannelVideoCount } from '../../../utils/youtubeDataApi'
import { loadFailedYouTubeVideos } from '../../../utils/failedYoutube'
import { getFailedOmdbMatches } from '../../../utils/failedOmdb'
import { getFailedPosterDownloads } from '../../../utils/posterDownloader'

export default defineEventHandler(async _event => {
  const db = await loadMoviesDatabase()
  const dbStats = await getDatabaseStats(db)

  // Get YouTube API key from environment
  const youtubeApiKey = process.env.YOUTUBE_API_KEY
  if (!youtubeApiKey) {
    throw new Error(
      'YOUTUBE_API_KEY environment variable is required. Get one from https://console.cloud.google.com/apis/credentials'
    )
  }

  // Load failed YouTube videos for stats
  const failedVideos = loadFailedYouTubeVideos()
  const failedOmdb = getFailedOmdbMatches()
  const failedPosters = getFailedPosterDownloads()

  // Calculate YouTube totals
  const youtubeTotalScraped = dbStats.youtubeChannels.reduce((sum, c) => sum + c.scraped, 0)
  const youtubeTotalFailed = failedVideos.length

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
        total = await getChannelVideoCount(youtubeApiKey, channelStat.id)
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

  // AI extraction stats (count unmatched movies with AI data)
  const unmatchedMovies = entries.filter(m => !m.imdbId.startsWith('tt'))
  const withAiData = unmatchedMovies.filter(m => m.ai?.title).length
  const withoutAiData = unmatchedMovies.length - withAiData

  const stats = {
    database: dbStats,
    external: {
      archiveOrg: {
        total: archiveTotal,
        scraped: dbStats.archiveOrgSources,
        percent: archiveTotal > 0 ? (dbStats.archiveOrgSources / archiveTotal) * 100 : 0,
        failed: 0, // Archive.org doesn't track failures currently
        failureRate: 0,
      },
      youtube: {
        totalScraped: youtubeTotalScraped,
        totalAvailable: youtubeChannelStats.reduce((sum, c) => sum + (c.total || 0), 0),
        totalFailed: youtubeTotalFailed,
        failureRate:
          youtubeTotalScraped + youtubeTotalFailed > 0
            ? (youtubeTotalFailed / (youtubeTotalScraped + youtubeTotalFailed)) * 100
            : 0,
        percent:
          youtubeChannelStats.reduce((sum, c) => sum + (c.total || 0), 0) > 0
            ? (youtubeTotalScraped /
                youtubeChannelStats.reduce((sum, c) => sum + (c.total || 0), 0)) *
              100
            : 0,
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
      failed: failedOmdb.length,
      failureRate:
        dbStats.matched + failedOmdb.length > 0
          ? (failedOmdb.length / (dbStats.matched + failedOmdb.length)) * 100
          : 0,
    },
    ai: {
      totalUnmatched: unmatchedMovies.length,
      withAiData,
      withoutAiData,
      percent: unmatchedMovies.length > 0 ? (withAiData / unmatchedMovies.length) * 100 : 0,
    },
    quality: {
      totalMarked: dbStats.qualityMarkedCount,
      breakdown: dbStats.qualityBreakdown,
      percent: dbStats.total > 0 ? (dbStats.qualityMarkedCount / dbStats.total) * 100 : 0,
    },
    posters: {
      totalMovies: entries.length,
      withPosterUrl: totalWithPosterUrl,
      downloaded: totalDownloaded,
      missing: totalWithPosterUrl - totalDownloaded,
      failed: failedPosters.length,
      failureRate:
        totalDownloaded + failedPosters.length > 0
          ? (failedPosters.length / (totalDownloaded + failedPosters.length)) * 100
          : 0,
      percentOfMoviesWithUrl:
        totalWithPosterUrl > 0 ? (totalDownloaded / totalWithPosterUrl) * 100 : 0,
      percentOfAllMovies: entries.length > 0 ? (matchedPosters.length / entries.length) * 100 : 0,
      filesInDirectory: posterFiles.length,
      matchedPosters: matchedPosters.length,
    },
    lastUpdated: new Date().toISOString(),
  }

  // Save to data/stats.json
  try {
    const dataDir = resolve(process.cwd(), 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    writeFileSync(join(dataDir, 'stats.json'), JSON.stringify(stats, null, 2))
  } catch (e) {
    console.error('Failed to save stats.json', e)
  }

  return stats
})
