import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { existsSync, unlinkSync } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { EmbeddingModelConfig } from '../../../config/embedding-models'

/**
 * Initialize the embeddings database for a specific model.
 * Creates the database and schema if it doesn't exist.
 * Uses sqlite-vec vec0 virtual table for efficient KNN search.
 */
export async function initEmbeddingsDatabase(
  modelConfig: EmbeddingModelConfig,
  forceRebuild = false
): Promise<Database.Database> {
  const dataDir = join(process.cwd(), 'public', 'data')
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }

  const dbPath = join(dataDir, modelConfig.dbFileName)

  // Delete existing database if force rebuild requested
  if (forceRebuild && existsSync(dbPath)) {
    console.log(`[Embeddings] Force rebuild: deleting ${modelConfig.dbFileName}`)
    unlinkSync(dbPath)
  }

  const db = new Database(dbPath)

  // Load sqlite-vec extension for vector search
  sqliteVec.load(db)

  // Create config table for metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  // Create vec_movies virtual table for vector search
  // This uses sqlite-vec's vec0 module for efficient KNN search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_movies USING vec0(
      movieId TEXT PRIMARY KEY,
      embedding FLOAT[${modelConfig.dimensions}]
    );
  `)

  // Insert or update model metadata
  const insertConfig = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
  insertConfig.run('embedding_model_id', modelConfig.id)
  insertConfig.run('embedding_model_name', modelConfig.name)
  insertConfig.run('embedding_dimensions', modelConfig.dimensions.toString())
  if (modelConfig.ollamaModel) {
    insertConfig.run('embedding_model_ollama', modelConfig.ollamaModel)
  }

  return db
}

/**
 * Get the set of movie IDs that already have embeddings in the database.
 */
export function getExistingEmbeddingIds(db: Database.Database): Set<string> {
  const existing = db.prepare('SELECT movieId FROM vec_movies').all() as { movieId: string }[]
  return new Set(existing.map(e => e.movieId))
}

/**
 * Save a single embedding to the database.
 */
export function saveEmbedding(
  db: Database.Database,
  movieId: string,
  embedding: Float32Array
): void {
  const buffer = Buffer.from(embedding.buffer)
  const insert = db.prepare(`
    INSERT OR REPLACE INTO vec_movies (movieId, embedding)
    VALUES (?, ?)
  `)
  insert.run(movieId, buffer)
}

/**
 * Get total count of embeddings in the database.
 */
export function getEmbeddingsCount(db: Database.Database): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM vec_movies').get() as { count: number }
  return result.count
}
