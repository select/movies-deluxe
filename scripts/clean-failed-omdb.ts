#!/usr/bin/env tsx
/**
 * Clean Failed OMDB Matches
 *
 * This script removes entries from data/failed-omdb.json if the corresponding
 * movie in data/movies.json already has AI-extracted metadata.
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry } from '../shared/types/movie'

interface FailedOmdbMatch {
  identifier: string
  originalTitle: string
  year?: number
  attempts: unknown[]
  failedAt: string
  lastAttempt: string
  reason?: string
}

async function cleanFailedOmdb() {
  const moviesPath = join(process.cwd(), 'data/movies.json')
  const failedPath = join(process.cwd(), 'data/failed-omdb.json')

  console.log('📖 Reading movies database...')
  const moviesData = await readFile(moviesPath, 'utf-8')
  const moviesDb: MoviesDatabase = JSON.parse(moviesData)

  console.log('📖 Reading failed OMDB matches...')
  let failedMatches: FailedOmdbMatch[]
  try {
    const failedData = await readFile(failedPath, 'utf-8')
    failedMatches = JSON.parse(failedData)
  } catch {
    console.log('ℹ️ No failed OMDB matches file found or it is empty.')
    return
  }

  const initialCount = failedMatches.length
  console.log(`🔍 Checking ${initialCount} failed matches against movies with AI metadata...`)

  const cleanedMatches = failedMatches.filter(match => {
    const entry = moviesDb[match.identifier]

    // Skip schema and other non-movie entries
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return true
    }

    // Check if it's a MovieEntry (it should be if it's in the DB with this ID)
    const movieEntry = entry as MovieEntry

    // If movie exists and has an 'ai' property, remove it from failed list
    if (movieEntry.ai) {
      console.log(
        `  🗑️ Removing ${match.identifier}: Already has AI metadata (${movieEntry.ai.title})`
      )
      return false
    }

    return true
  })

  const removedCount = initialCount - cleanedMatches.length

  if (removedCount > 0) {
    console.log(`\n✅ Removed ${removedCount} entries that already have AI metadata.`)
    console.log('💾 Saving cleaned failed OMDB matches...')
    await writeFile(failedPath, JSON.stringify(cleanedMatches, null, 2), 'utf-8')
    console.log('✅ Success!')
  } else {
    console.log('\n✅ No entries needed removal.')
  }
}

cleanFailedOmdb().catch(() => {
  process.exit(1)
})
