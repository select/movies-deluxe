/**
 * Migration script to extract failed OMDB matches from movies.json
 * to separate failed-omdb.json file
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

interface FailedOmdbMatch {
  identifier: string
  title: string
  failedAt: string
  reason?: string
}

async function migrate() {
  const moviesFile = join(process.cwd(), 'public/data/movies.json')
  const failedOmdbFile = join(process.cwd(), 'public/data/failed-omdb.json')

  console.log('Loading movies.json...')
  const moviesData = await readFile(moviesFile, 'utf-8')
  const db = JSON.parse(moviesData)

  const failedMatches: string[] = db._failedOmdbMatches || []
  console.log(`Found ${failedMatches.length} failed OMDB matches`)

  if (failedMatches.length === 0) {
    console.log('No failed matches to migrate')
    return
  }

  // Create failed-omdb.json entries
  const failedOmdbData: FailedOmdbMatch[] = failedMatches.map(identifier => {
    // Try to find the movie entry to get the title
    const movieEntry = db[identifier]
    const title = movieEntry?.title || identifier

    return {
      identifier,
      title,
      failedAt: new Date().toISOString(),
      reason: 'Migrated from movies.json',
    }
  })

  // Write to failed-omdb.json
  console.log(`Writing ${failedOmdbData.length} entries to failed-omdb.json...`)
  await writeFile(failedOmdbFile, JSON.stringify(failedOmdbData, null, 2))

  // Remove from movies.json
  console.log('Removing _failedOmdbMatches from movies.json...')
  delete db._failedOmdbMatches
  db._schema.lastUpdated = new Date().toISOString()
  await writeFile(moviesFile, JSON.stringify(db, null, 2))

  console.log('✅ Migration complete!')
  console.log(`   - Created: ${failedOmdbFile}`)
  console.log(`   - Updated: ${moviesFile}`)
  console.log(`   - Migrated: ${failedOmdbData.length} failed matches`)
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})
