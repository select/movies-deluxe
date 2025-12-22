import { getDatabaseStats, loadMoviesDatabase } from '../../../utils/movieData'

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
  }
})
