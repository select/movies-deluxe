import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { CollectionsDatabase, Collection, SavedQuery } from '../../shared/types/collections'

const DATA_DIR = join(process.cwd(), 'public/data')
const COLLECTIONS_FILE = join(DATA_DIR, 'collections.json')

/**
 * Load the collections database from disk
 */
export async function loadCollectionsDatabase(): Promise<CollectionsDatabase> {
  try {
    if (!existsSync(COLLECTIONS_FILE)) {
      return createEmptyDatabase()
    }

    const content = await readFile(COLLECTIONS_FILE, 'utf-8')
    return JSON.parse(content) as CollectionsDatabase
  } catch (error) {
    console.error('Failed to load collections database:', error)
    throw error
  }
}

/**
 * Save the collections database to disk
 */
export async function saveCollectionsDatabase(db: CollectionsDatabase): Promise<void> {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true })
    }

    db._schema.lastUpdated = new Date().toISOString()
    const content = JSON.stringify(db, null, 2)
    await writeFile(COLLECTIONS_FILE, content, 'utf-8')
  } catch (error) {
    console.error('Failed to save collections database:', error)
    throw error
  }
}

function createEmptyDatabase(): CollectionsDatabase {
  return {
    _schema: {
      version: '1.0.0',
      description: 'Movie collections database',
      lastUpdated: new Date().toISOString(),
    },
  }
}

/**
 * Get all collections as an array
 */
export async function getCollections(): Promise<Collection[]> {
  const db = await loadCollectionsDatabase()
  return Object.entries(db)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, value]) => value as Collection)
}

/**
 * Get a single collection by ID
 */
export async function getCollectionById(id: string): Promise<Collection | undefined> {
  const db = await loadCollectionsDatabase()
  const collection = db[id]
  if (collection && !('version' in collection)) {
    return collection as Collection
  }
  return undefined
}

/**
 * Create or update a collection
 */
export async function upsertCollection(collection: Collection): Promise<void> {
  const db = await loadCollectionsDatabase()
  db[collection.id] = {
    ...collection,
    updatedAt: new Date().toISOString(),
  }
  await saveCollectionsDatabase(db)
}

/**
 * Delete a collection
 */
export async function deleteCollection(id: string): Promise<boolean> {
  const db = await loadCollectionsDatabase()
  if (db[id]) {
    delete db[id]
    await saveCollectionsDatabase(db)
    return true
  }
  return false
}

/**
 * Add a movie to a collection
 */
export async function addMovieToCollection(
  collectionId: string,
  movieId: string
): Promise<boolean> {
  const db = await loadCollectionsDatabase()
  const collection = db[collectionId] as Collection | undefined

  if (collection && !('version' in collection)) {
    if (!collection.movieIds.includes(movieId)) {
      collection.movieIds.push(movieId)
      collection.updatedAt = new Date().toISOString()
      await saveCollectionsDatabase(db)
      return true
    }
    return false
  }
  return false
}

/**
 * Remove a movie from a collection
 */
export async function removeMovieFromCollection(
  collectionId: string,
  movieId: string
): Promise<boolean> {
  const db = await loadCollectionsDatabase()
  const collection = db[collectionId] as Collection | undefined

  if (collection && !('version' in collection)) {
    const index = collection.movieIds.indexOf(movieId)
    if (index !== -1) {
      collection.movieIds.splice(index, 1)
      collection.updatedAt = new Date().toISOString()
      await saveCollectionsDatabase(db)
      return true
    }
    return false
  }
  return false
}

/**
 * Add a saved query to a collection
 */
export async function addQueryToCollection(
  collectionId: string,
  query: SavedQuery
): Promise<boolean> {
  const db = await loadCollectionsDatabase()
  const collection = db[collectionId] as Collection | undefined

  if (collection && !('version' in collection)) {
    if (!collection.savedQueries) {
      collection.savedQueries = []
    }
    collection.savedQueries.push(query)
    collection.updatedAt = new Date().toISOString()
    await saveCollectionsDatabase(db)
    return true
  }
  return false
}

/**
 * Remove a saved query from a collection
 */
export async function removeQueryFromCollection(
  collectionId: string,
  queryIndex: number
): Promise<boolean> {
  const db = await loadCollectionsDatabase()
  const collection = db[collectionId] as Collection | undefined

  if (collection && !('version' in collection) && collection.savedQueries) {
    if (queryIndex >= 0 && queryIndex < collection.savedQueries.length) {
      collection.savedQueries.splice(queryIndex, 1)
      collection.updatedAt = new Date().toISOString()
      await saveCollectionsDatabase(db)
      return true
    }
  }
  return false
}

/**
 * Update collection tags
 */
export async function updateCollectionTags(collectionId: string, tags: string[]): Promise<boolean> {
  const db = await loadCollectionsDatabase()
  const collection = db[collectionId] as Collection | undefined

  if (collection && !('version' in collection)) {
    collection.tags = tags
    collection.updatedAt = new Date().toISOString()
    await saveCollectionsDatabase(db)
    return true
  }
  return false
}
