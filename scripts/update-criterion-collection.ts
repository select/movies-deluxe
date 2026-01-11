#!/usr/bin/env tsx

/**
 * Update Criterion Collection Script
 *
 * This script reads the Criterion Collection IDs from data/criterion-collection.json,
 * finds all matching movies in the database, and updates the criterion-collection
 * in public/data/collections.json with the found movies.
 */

import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadMoviesDatabase } from '../server/utils/movieData'
import type { MovieEntry } from '../shared/types/movie'

const CRITERION_IDS_FILE = join(process.cwd(), 'data/criterion-collection.json')
const COLLECTIONS_FILE = join(process.cwd(), 'public/data/collections.json')

interface Collection {
  id: string
  name: string
  description: string
  movieIds: string[]
  createdAt: string
  updatedAt: string
  savedQueries?: unknown[]
  tags?: string[]
}

interface CollectionsDatabase {
  _schema: {
    version: string
    description: string
    lastUpdated: string
  }
  [collectionId: string]: Collection | unknown
}

async function loadCriterionIds(): Promise<string[]> {
  if (!existsSync(CRITERION_IDS_FILE)) {
    throw new Error(`Criterion IDs file not found: ${CRITERION_IDS_FILE}`)
  }

  const content = await readFile(CRITERION_IDS_FILE, 'utf-8')
  const ids = JSON.parse(content) as string[]

  console.log(`📚 Loaded ${ids.length} Criterion Collection IDs`)
  return ids
}

async function loadCollections(): Promise<CollectionsDatabase> {
  if (!existsSync(COLLECTIONS_FILE)) {
    throw new Error(`Collections file not found: ${COLLECTIONS_FILE}`)
  }

  const content = await readFile(COLLECTIONS_FILE, 'utf-8')
  const collections = JSON.parse(content) as CollectionsDatabase

  console.log(`📂 Loaded collections database`)
  return collections
}

async function saveCollections(collections: CollectionsDatabase): Promise<void> {
  collections._schema.lastUpdated = new Date().toISOString()
  const content = JSON.stringify(collections, null, 2)
  await writeFile(COLLECTIONS_FILE, content, 'utf-8')
  console.log(`💾 Saved updated collections to ${COLLECTIONS_FILE}`)
}

async function main() {
  console.log('🚀 Starting Criterion Collection update...')

  try {
    // Load the Criterion Collection IDs
    const criterionIds = await loadCriterionIds()

    // Load the movies database
    console.log('📖 Loading movies database...')
    const moviesDb = await loadMoviesDatabase()

    // Find matching movies in the database
    console.log('🔍 Finding matching movies in database...')
    const foundMovies: string[] = []
    const notFoundIds: string[] = []

    for (const id of criterionIds) {
      const movie = moviesDb[id] as MovieEntry | undefined
      if (movie) {
        foundMovies.push(id)
      } else {
        notFoundIds.push(id)
      }
    }

    console.log(`✅ Found ${foundMovies.length} movies in database`)
    console.log(`❌ ${notFoundIds.length} movies not found in database`)

    if (notFoundIds.length > 0) {
      console.log('\n📋 Movies not found in database:')
      notFoundIds.slice(0, 10).forEach(id => console.log(`  - ${id}`))
      if (notFoundIds.length > 10) {
        console.log(`  ... and ${notFoundIds.length - 10} more`)
      }
    }

    // Load collections database
    const collections = await loadCollections()

    // Update the Criterion Collection
    const criterionCollection = collections['criterion-collection'] as Collection
    if (!criterionCollection) {
      throw new Error('Criterion Collection not found in collections database')
    }

    console.log(
      `\n📊 Current Criterion Collection has ${criterionCollection.movieIds.length} movies`
    )

    // Update the collection with found movies
    criterionCollection.movieIds = foundMovies.sort()
    criterionCollection.updatedAt = new Date().toISOString()

    console.log(
      `📊 Updated Criterion Collection now has ${criterionCollection.movieIds.length} movies`
    )

    // Save the updated collections
    await saveCollections(collections)

    console.log('\n' + '='.repeat(50))
    console.log('✨ UPDATE COMPLETE')
    console.log('='.repeat(50))
    console.log(`Total Criterion IDs processed: ${criterionIds.length}`)
    console.log(`Movies found in database: ${foundMovies.length}`)
    console.log(`Movies not found: ${notFoundIds.length}`)
    console.log(`Collection updated successfully!`)
    console.log('='.repeat(50))
  } catch (error) {
    console.error('💥 Fatal error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Run the script
main()
