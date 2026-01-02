import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import Database from 'better-sqlite3'

interface Collection {
  id: string
  name: string
  description: string
  movieIds: string[]
  createdAt: string
  updatedAt: string
}

interface CollectionsDatabase {
  _schema: {
    version: string
    description: string
    lastUpdated: string
  }
  [key: string]: Collection | CollectionsDatabase['_schema']
}

const DATA_DIR = join(process.cwd(), 'public/data')
const COLLECTIONS_FILE = join(DATA_DIR, 'collections.json')
const MOVIES_DB_FILE = join(process.cwd(), 'public/data/movies.db')

async function cleanCollections() {
  console.log('🧹 Cleaning collections from movies not in database...\n')

  // Load collections
  const collectionsContent = await readFile(COLLECTIONS_FILE, 'utf-8')
  const collectionsDb: CollectionsDatabase = JSON.parse(collectionsContent)

  // Open SQLite database
  const db = new Database(MOVIES_DB_FILE, { readonly: true })

  // Get all movie IDs from database
  const movieRows = db.prepare('SELECT imdbId FROM movies').all() as { imdbId: string }[]
  const validMovieIds = new Set(movieRows.map(row => row.imdbId))
  console.log(`📊 Total movies in database: ${validMovieIds.size}`)

  // Also get all source IDs (archive.org and youtube)
  const sourceRows = db
    .prepare('SELECT DISTINCT identifier FROM sources WHERE type IN (?, ?)')
    .all('archive.org', 'youtube') as { identifier: string }[]

  sourceRows.forEach(row => {
    if (row.identifier.startsWith('archive-')) {
      validMovieIds.add(row.identifier)
    } else if (row.identifier.startsWith('youtube-')) {
      validMovieIds.add(row.identifier)
    } else {
      // Add with prefix
      validMovieIds.add(`archive-${row.identifier}`)
      validMovieIds.add(`youtube-${row.identifier}`)
    }
  })

  console.log(`📊 Total valid IDs (including sources): ${validMovieIds.size}\n`)

  let totalRemoved = 0
  let totalCollections = 0
  const collectionStats: Array<{
    name: string
    before: number
    after: number
    removed: number
  }> = []

  // Process each collection
  for (const [key, value] of Object.entries(collectionsDb)) {
    if (key.startsWith('_')) continue

    const collection = value as Collection
    totalCollections++

    const beforeCount = collection.movieIds.length
    const validMovieIdsInCollection = collection.movieIds.filter(id => validMovieIds.has(id))
    const afterCount = validMovieIdsInCollection.length
    const removedCount = beforeCount - afterCount

    if (removedCount > 0) {
      collection.movieIds = validMovieIdsInCollection
      collection.updatedAt = new Date().toISOString()
      totalRemoved += removedCount

      collectionStats.push({
        name: collection.name,
        before: beforeCount,
        after: afterCount,
        removed: removedCount,
      })

      console.log(`🗑️  ${collection.name}:`)
      console.log(`   Before: ${beforeCount} movies`)
      console.log(`   After: ${afterCount} movies`)
      console.log(`   Removed: ${removedCount} invalid movie IDs\n`)
    }
  }

  db.close()

  // Save cleaned collections
  if (totalRemoved > 0) {
    collectionsDb._schema.lastUpdated = new Date().toISOString()
    await writeFile(COLLECTIONS_FILE, JSON.stringify(collectionsDb, null, 2), 'utf-8')
    console.log(`✅ Cleaned collections saved to ${COLLECTIONS_FILE}`)
  } else {
    console.log('✅ No invalid movie IDs found in collections')
  }

  // Summary
  console.log('\n📈 Summary:')
  console.log(`   Total collections: ${totalCollections}`)
  console.log(`   Collections cleaned: ${collectionStats.length}`)
  console.log(`   Total invalid IDs removed: ${totalRemoved}`)

  if (collectionStats.length > 0) {
    console.log('\n📋 Detailed breakdown:')
    collectionStats.forEach(stat => {
      console.log(
        `   ${stat.name}: ${stat.before} → ${stat.after} (-${stat.removed} = ${((stat.removed / stat.before) * 100).toFixed(1)}%)`
      )
    })
  }
}

cleanCollections().catch(err => {
  console.error('❌ Error cleaning collections:', err)
  process.exit(1)
})
