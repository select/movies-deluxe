/**
 * Sync a collection from SQLite to collections.json
 * Usage: pnpm tsx scripts/sync-collection-from-sqlite.ts <collectionId>
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { loadCollectionsDatabase, saveCollectionsDatabase } from '../server/utils/collections'

const DB_PATH = join(process.cwd(), 'public/data/movies.db')

async function syncCollectionFromSQLite(collectionId: string) {
  console.log(`Syncing collection '${collectionId}' from SQLite to JSON...`)

  // Open SQLite database
  const sqlite = new Database(DB_PATH, { readonly: true })

  try {
    // Get collection metadata
    const collection = sqlite
      .prepare('SELECT * FROM collections WHERE id = ?')
      .get(collectionId) as
      | { id: string; name: string; description: string; createdAt: string; updatedAt: string }
      | undefined

    if (!collection) {
      console.error(`Collection '${collectionId}' not found in SQLite database`)
      process.exit(1)
    }

    // Get all movie IDs for this collection
    const movieIds = sqlite
      .prepare('SELECT movieId FROM collection_movies WHERE collectionId = ? ORDER BY addedAt')
      .all(collectionId) as { movieId: string }[]

    console.log(`Found ${movieIds.length} movies in collection`)

    // Load collections.json
    const db = await loadCollectionsDatabase()

    // Update the collection
    db[collectionId] = {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      movieIds: movieIds.map(row => row.movieId),
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }

    // Save back to collections.json
    await saveCollectionsDatabase(db)

    console.log(`✓ Successfully synced collection '${collectionId}'`)
    console.log(`  - Name: ${collection.name}`)
    console.log(`  - Movies: ${movieIds.length}`)
    console.log(`  - Updated: ${collection.updatedAt}`)
  } finally {
    sqlite.close()
  }
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]!)) {
  const collectionId = process.argv[2]
  if (!collectionId) {
    console.error('Usage: pnpm tsx scripts/sync-collection-from-sqlite.ts <collectionId>')
    process.exit(1)
  }

  syncCollectionFromSQLite(collectionId).catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { syncCollectionFromSQLite }
