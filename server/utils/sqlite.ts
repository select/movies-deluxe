import Database from 'better-sqlite3'
import { join } from 'path'

let db: Database.Database | null = null

export function getSqliteDatabase() {
  if (!db) {
    const dbPath = join(process.cwd(), 'public/data/movies.db')
    db = new Database(dbPath, { readonly: true })
  }
  return db
}

export function querySqlite<T = unknown>(sql: string, params: unknown[] = []): T[] {
  const database = getSqliteDatabase()
  return database.prepare(sql).all(...params) as T[]
}
