#!/usr/bin/env tsx
/**
 * Migrate Archive.org Source Titles
 *
 * Problem: Existing archive.org sources don't have the 'title' field populated
 * Solution: Copy the movie entry's title to each archive.org source's title field
 *
 * This allows the curation interface to show the original Archive.org title
 * alongside the cleaned/OMDB-enriched title.
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

interface Source {
  type: string
  id?: string
  title?: string
  [key: string]: unknown
}

interface MovieEntry {
  id: string | null
  imdbId: string
  title: string | string[]
  sources?: Source[]
  metadata?: {
    Title?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface MoviesDatabase {
  [key: string]: MovieEntry
}

async function migrateArchiveSourceTitles() {
  const dbPath = join(process.cwd(), 'public/data/movies.json')
  console.log('📖 Reading movies database...')
  const data = await readFile(dbPath, 'utf-8')
  const db: MoviesDatabase = JSON.parse(data)

  let totalMovies = 0
  let moviesWithArchiveSources = 0
  let sourcesUpdated = 0
  let sourcesAlreadyHaveTitle = 0

  console.log('🔧 Migrating archive.org source titles...\n')

  for (const entry of Object.values(db)) {
    totalMovies++

    if (!entry.sources || entry.sources.length === 0) continue

    const archiveSources = entry.sources.filter(s => s.type === 'archive.org')
    if (archiveSources.length === 0) continue

    moviesWithArchiveSources++

    // Determine which title to use for the source
    // Priority: entry.title (original Archive.org title) > metadata.Title (OMDB title)
    const sourceTitle = Array.isArray(entry.title) ? entry.title[0] : entry.title

    for (const source of archiveSources) {
      if (source.title) {
        sourcesAlreadyHaveTitle++
        continue
      }

      // Set the title to the entry's title (which is the original Archive.org title)
      source.title = sourceTitle
      sourcesUpdated++

      if (sourcesUpdated <= 5) {
        console.log(`Example ${sourcesUpdated}:`)
        console.log(`  Movie ID: ${entry.imdbId}`)
        console.log(`  Source ID: ${source.id}`)
        console.log(`  Title set to: "${sourceTitle}"`)
        if (entry.metadata?.Title && entry.metadata.Title !== sourceTitle) {
          console.log(`  (OMDB title: "${entry.metadata.Title}")`)
        }
        console.log()
      }
    }
  }

  console.log('📊 Summary:')
  console.log(`  Total movies: ${totalMovies}`)
  console.log(`  Movies with archive.org sources: ${moviesWithArchiveSources}`)
  console.log(`  Sources updated: ${sourcesUpdated}`)
  console.log(`  Sources already had title: ${sourcesAlreadyHaveTitle}`)
  console.log()

  if (sourcesUpdated > 0) {
    console.log('💾 Saving updated database...')
    await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8')
    console.log('✅ Migration completed successfully!')
  } else {
    console.log('✅ No updates needed, all sources already have titles!')
  }
}

// Run the script
migrateArchiveSourceTitles().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})
