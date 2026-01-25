import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { EmbeddingModelConfig } from '../../../config/embedding-models'

/**
 * Initialize the embeddings database for a specific model.
 * Creates the database and schema if it doesn't exist.
 */
export async function initEmbeddingsDatabase(
  modelConfig: EmbeddingModelConfig
): Promise<Database.Database> {
  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }

  const dbPath = join(dataDir, modelConfig.dbFileName)
  const db = new Database(dbPath)

  // Ensure schema exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      movie_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_created_at ON embeddings(created_at);

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  // Insert or update model metadata
  const insertConfig = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
  insertConfig.run('embedding_model_id', modelConfig.id)
  insertConfig.run('embedding_model_name', modelConfig.name)
  insertConfig.run('embedding_model_dimensions', modelConfig.dimensions.toString())
  if (modelConfig.ollamaModel) {
    insertConfig.run('embedding_model_ollama', modelConfig.ollamaModel)
  }

  return db
}

/**
 * Get the set of movie IDs that already have embeddings in the database.
 */
export function getExistingEmbeddingIds(db: Database.Database): Set<string> {
  const existing = db.prepare('SELECT movie_id FROM embeddings').all() as { movie_id: string }[]
  return new Set(existing.map(e => e.movie_id))
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
  const now = new Date().toISOString()
  const insert = db.prepare(`
    INSERT OR REPLACE INTO embeddings (movie_id, embedding, created_at)
    VALUES (?, ?, ?)
  `)
  insert.run(movieId, buffer, now)
}

/**
 * Get total count of embeddings in the database.
 */
export function getEmbeddingsCount(db: Database.Database): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number }
  return result.count
}
