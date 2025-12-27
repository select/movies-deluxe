#!/usr/bin/env tsx
/**
 * Fix Duplicate Archive.org Sources and Movies
 *
 * Problems:
 * 1. Duplicate movie entries with same imdbId
 * 2. Sources have both 'identifier' and 'id' fields (incomplete migration)
 * 3. Duplicate sources within same movie entry
 *
 * Solutions:
 * 1. Merge duplicate movie entries, keeping all unique sources
 * 2. Migrate 'identifier' to 'id' and remove 'identifier' field
 * 3. Deduplicate sources by ID within each entry
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

interface Source {
  type: string
  id?: string | null
  identifier?: string // Old field to migrate
  url?: string
  title?: string
  description?: string
  [key: string]: unknown
}

interface MovieEntry {
  id: string | null
  imdbId: string
  title: string
  sources?: Source[]
  [key: string]: unknown
}

interface MoviesDatabase {
  [key: string]: MovieEntry
}

async function fixDuplicateArchiveSources() {
  const dbPath = join(process.cwd(), 'public/data/movies.json')
  console.log('📖 Reading movies database...')
  const data = await readFile(dbPath, 'utf-8')
  const db: MoviesDatabase = JSON.parse(data)

  const totalMovies = Object.keys(db).length
  let identifiersMigrated = 0
  let duplicateMoviesMerged = 0
  let sourcesDeduped = 0

  console.log('🔧 Step 1: Migrating identifier → id in sources...\n')

  for (const entry of Object.values(db)) {
    if (!entry.sources) continue

    for (const source of entry.sources) {
      if (source.type === 'archive.org' && 'identifier' in source) {
        // Migrate identifier to id
        if (!source.id && source.identifier) {
          source.id = source.identifier
          identifiersMigrated++
        }
        // Remove old identifier field
        delete source.identifier
      }
    }
  }

  console.log(`✅ Migrated ${identifiersMigrated} identifier fields to id\n`)

  console.log('🔧 Step 2: Deduplicating sources within entries...\n')

  for (const entry of Object.values(db)) {
    if (!entry.sources || entry.sources.length === 0) continue

    const seenSources = new Map<string, Source>()

    for (const source of entry.sources) {
      const key = `${source.type}:${source.id || 'unknown'}`

      if (seenSources.has(key)) {
        sourcesDeduped++
      } else {
        seenSources.set(key, source)
      }
    }

    entry.sources = Array.from(seenSources.values())
  }

  console.log(`✅ Removed ${sourcesDeduped} duplicate sources\n`)

  console.log('🔧 Step 3: Merging duplicate movie entries...\n')

  // Group by imdbId
  const imdbGroups = new Map<string, Array<[string, MovieEntry]>>()

  for (const [key, entry] of Object.entries(db)) {
    if (!imdbGroups.has(entry.imdbId)) {
      imdbGroups.set(entry.imdbId, [])
    }
    imdbGroups.get(entry.imdbId)!.push([key, entry])
  }

  // Merge duplicates
  const newDb: MoviesDatabase = {}

  for (const [imdbId, entries] of imdbGroups) {
    if (entries.length === 1) {
      // No duplicates, keep as is
      const [key, entry] = entries[0]!
      newDb[key] = entry
    } else {
      // Merge duplicates
      duplicateMoviesMerged += entries.length - 1

      // Use first entry as base
      const [firstKey, firstEntry] = entries[0]!
      const merged: MovieEntry = { ...firstEntry }

      // Collect all unique sources
      const allSources = new Map<string, Source>()

      for (const [, entry] of entries) {
        if (!entry.sources) continue

        for (const source of entry.sources) {
          const key = `${source.type}:${source.id || 'unknown'}`
          if (!allSources.has(key)) {
            allSources.set(key, source)
          }
        }
      }

      merged.sources = Array.from(allSources.values())
      newDb[firstKey] = merged

      if (duplicateMoviesMerged <= 5) {
        console.log(`Example ${duplicateMoviesMerged}:`)
        console.log(`  IMDb ID: ${imdbId}`)
        console.log(`  Title: ${firstEntry.title}`)
        console.log(`  Merged ${entries.length} entries into 1`)
        console.log(`  Total sources: ${merged.sources?.length || 0}`)
        console.log()
      }
    }
  }

  console.log('📊 Summary:')
  console.log(`  Original movies: ${totalMovies}`)
  console.log(`  After deduplication: ${Object.keys(newDb).length}`)
  console.log(`  Duplicate movies merged: ${duplicateMoviesMerged}`)
  console.log(`  identifier fields migrated: ${identifiersMigrated}`)
  console.log(`  Duplicate sources removed: ${sourcesDeduped}`)
  console.log()

  console.log('💾 Saving cleaned database...')
  await writeFile(dbPath, JSON.stringify(newDb, null, 2), 'utf-8')
  console.log('✅ Database cleaned successfully!')
}

// Run the script
fixDuplicateArchiveSources().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})
