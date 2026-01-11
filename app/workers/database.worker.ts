import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { SQLite3, SQLiteDatabase } from '~/types/sqlite-wasm'

// SqlValue type from sqlite-wasm
type _SqlValue = string | number | null | bigint | Uint8Array | Int8Array | ArrayBuffer

let db: SQLiteDatabase | null = null
let sqlite3: SQLite3 | null = null
let initializationPromise: Promise<void> | null = null

// Cache for movie data to avoid re-fetching
const movieCache = new Map<string, Record<string, unknown>>()

async function initDatabase() {
  if (sqlite3) return sqlite3

  try {
    sqlite3 = await sqlite3InitModule({
      print: (...args: string[]) => console.log(...args),
      printErr: (...args: string[]) => console.error(...args),
      locateFile: (file: string) => {
        // Point to the WASM file in the public directory
        if (file.endsWith('.wasm')) {
          return `/sqlite-wasm/${file}`
        }
        return file
      },
    })

    console.log('SQLite WASM initialized successfully')
    return sqlite3
  } catch (err) {
    console.error('Failed to initialize SQLite:', err)
    throw err
  }
}

async function loadRemoteDatabase(url: string) {
  const sqlite = await initDatabase()
  if (!sqlite) {
    throw new Error('Failed to initialize SQLite')
  }

  try {
    console.log('Fetching database from:', url)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch database: ${response.status} ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Close existing database if any
    if (db) {
      db.close()
      db = null
    }

    // Create a new in-memory database
    db = new sqlite.oo1.DB(':memory:')

    // Check if sqlite3_deserialize is available
    if (typeof sqlite.capi.sqlite3_deserialize !== 'function') {
      console.error('sqlite3_deserialize is not available!')
      throw new Error('sqlite3_deserialize is not available in this SQLite build')
    }

    // Allocate memory using sqlite3_malloc (required for deserialize)
    const pMem = sqlite.capi.sqlite3_malloc(uint8Array.byteLength)
    if (!pMem) {
      throw new Error('Failed to allocate memory for database')
    }

    // Copy the database content to the allocated memory
    try {
      sqlite.wasm.heap8u().set(uint8Array, pMem)
    } catch (err) {
      console.error('Failed to copy to WASM memory:', err)
      throw err
    }

    const flags =
      sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_READONLY

    if (!db.pointer) {
      throw new Error('Database pointer is undefined')
    }

    const rc = sqlite.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      pMem,
      uint8Array.byteLength,
      uint8Array.byteLength,
      flags
    )

    if (rc !== sqlite.capi.SQLITE_OK) {
      const errMsg = sqlite.capi.sqlite3_errmsg(db.pointer)
      throw new Error(`Failed to deserialize database: ${errMsg}`)
    }

    // Verify the database loaded correctly
    const testResult = db.exec({
      sql: 'SELECT COUNT(*) as count FROM movies',
      returnValue: 'resultRows',
      rowMode: 'object',
    })

    const firstRow = testResult[0] as { count: number } | undefined
    console.log('Database loaded successfully, movies count:', firstRow?.count)
    return true
  } catch (err) {
    console.error('Failed to load remote database:', err)
    throw err
  }
}

// Message queue to ensure sequential processing
interface QueuedMessage {
  type: string
  id: string
  sql?: string
  params?: (string | number)[]
  url?: string
  imdbId?: string
  imdbIds?: string[]
  movieId?: string
  limit?: number
  offset?: number
  includeCount?: boolean
  select?: string
  from?: string
  where?: string
  groupBy?: string
  orderBy?: string
  options?: Record<string, string | number | boolean>
}

const messageQueue: QueuedMessage[] = []
let isProcessing = false

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (messageQueue.length > 0) {
    const e = messageQueue.shift()
    if (e) {
      await handleMessage(e)
    }
  }

  isProcessing = false
}

self.onmessage = (e: MessageEvent) => {
  messageQueue.push(e.data as QueuedMessage)
  processQueue()
}

async function handleMessage(e: QueuedMessage) {
  const { type, sql, params, id, url } = e

  try {
    if (type === 'init') {
      if (initializationPromise) {
        await initializationPromise
        self.postMessage({ id, type: 'init-success', success: true })
        return
      }

      initializationPromise = (async () => {
        await initDatabase()
        if (url) {
          await loadRemoteDatabase(url)
        }
      })()

      await initializationPromise
      self.postMessage({ id, type: 'init-success', success: true })
      return
    }

    // Wait for initialization if it's in progress
    if (initializationPromise) {
      await initializationPromise
    }

    // All other operations require initialized database
    if (!db) {
      throw new Error('Database not initialized. Call init first.')
    }

    if (type === 'exec') {
      if (!sql) {
        self.postMessage({ id, error: 'SQL query is required' })
        return
      }

      const result = db.exec({
        sql,
        bind: params || [],
        returnValue: 'resultRows',
        rowMode: 'object',
      })
      self.postMessage({ id, result })
    } else if (type === 'query') {
      const {
        select = '*',
        from,
        where = '',
        params = [],
        groupBy = '',
        orderBy = '',
        limit,
        offset,
        includeCount = false,
      } = e

      let sql = `SELECT ${select} FROM ${from}`
      if (where) sql += ` WHERE ${where}`
      if (groupBy) sql += ` GROUP BY ${groupBy}`

      const finalOrderBy =
        orderBy || (from === 'movies m' || from === 'movies' ? 'm.year DESC, m.imdbId ASC' : '')
      if (finalOrderBy) sql += ` ORDER BY ${finalOrderBy}`

      if (limit !== undefined) sql += ` LIMIT ${limit}`
      if (offset !== undefined) sql += ` OFFSET ${offset}`

      const result = db.exec({
        sql,
        bind: params,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      let totalCount = undefined
      if (includeCount) {
        let countSql = `SELECT COUNT(*) as count FROM (SELECT 1 FROM ${from}`
        if (where) countSql += ` WHERE ${where}`
        if (groupBy) countSql += ` GROUP BY ${groupBy}`
        countSql += `)`

        const countResult = db.exec({
          sql: countSql,
          bind: params,
          returnValue: 'resultRows',
          rowMode: 'object',
        })
        const firstRow = countResult[0] as { count: number } | undefined
        totalCount = firstRow?.count
      }

      self.postMessage({ id, result, totalCount })
    } else if (type === 'query-lightweight') {
      // Lightweight query for grid display (minimal data, no joins)
      const { where = '', params = [], orderBy = '', limit, offset, includeCount = false } = e

      // Select essential fields for grid display and filtering
      let sql = `SELECT m.imdbId, m.title, m.year, m.imdbRating, m.imdbVotes, m.language, m.primarySourceType as sourceType, m.primaryChannelName as channelName, m.verified FROM movies m`
      if (where) sql += ` WHERE ${where}`

      const finalOrderBy = orderBy || 'm.year DESC, m.imdbId ASC'
      sql += ` ORDER BY ${finalOrderBy}`

      if (limit !== undefined) sql += ` LIMIT ${limit}`
      if (offset !== undefined) sql += ` OFFSET ${offset}`

      const result = db.exec({
        sql,
        bind: params,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      let totalCount = undefined
      if (includeCount) {
        let countSql = `SELECT COUNT(*) as count FROM movies m`
        if (where) countSql += ` WHERE ${where}`

        const countResult = db.exec({
          sql: countSql,
          bind: params,
          returnValue: 'resultRows',
          rowMode: 'object',
        })
        const firstRow = countResult[0] as { count: number } | undefined
        totalCount = firstRow?.count
      }

      self.postMessage({ id, result, totalCount })
    } else if (type === 'query-by-ids') {
      // Query lightweight movie details for specific IDs (sources now in JSON files)
      const { imdbIds } = e

      if (!imdbIds || imdbIds.length === 0) {
        self.postMessage({ id, result: [] })
        return
      }

      const results: Record<string, unknown>[] = []
      const idsToFetch: string[] = []

      // Check cache first
      for (const imdbId of imdbIds as string[]) {
        const cached = movieCache.get(imdbId)
        if (cached) {
          results.push(cached)
        } else {
          idsToFetch.push(imdbId)
        }
      }

      if (idsToFetch.length > 0) {
        const placeholders = idsToFetch.map(() => '?').join(',')
        const sql = `
          SELECT m.imdbId, m.title, m.year, m.imdbRating, m.imdbVotes, m.language, 
                 m.primarySourceType as sourceType, m.primaryChannelName as channelName, 
                 m.verified, m.lastUpdated, m.genre, m.country
          FROM movies m
          WHERE m.imdbId IN (${placeholders})
        `

        const dbResults = db.exec({
          sql,
          bind: idsToFetch,
          returnValue: 'resultRows',
          rowMode: 'object',
        })

        // Transform and cache new results
        for (const row of dbResults) {
          const transformed = {
            ...row,
            verified: row.verified === 1,
          }
          movieCache.set(row.imdbId as string, transformed)
          results.push(transformed)
        }
      }

      // Sort results to match the order of requested IDs
      const sortedResults = (imdbIds as string[])
        .map(imdbId => results.find(r => r.imdbId === imdbId))
        .filter(Boolean)

      self.postMessage({ id, result: sortedResults })
    } else if (type === 'query-collections-for-movie') {
      // Query collections for a specific movie
      const { movieId } = e

      const sql = `
        SELECT c.id, c.name, c.description, c.createdAt, c.updatedAt
        FROM collections c
        INNER JOIN collection_movies cm ON c.id = cm.collectionId
        WHERE cm.movieId = ?
        ORDER BY c.name ASC
      `

      const result = db.exec({
        sql,
        bind: [movieId],
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      self.postMessage({ id, result })
    } else if (type === 'get-filter-options') {
      const genres = db.exec({
        sql: 'SELECT name, movie_count as count FROM genres ORDER BY movie_count DESC, name ASC',
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      const countries = db.exec({
        sql: 'SELECT name, movie_count as count FROM countries ORDER BY movie_count DESC, name ASC',
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      const channels = db.exec({
        sql: `
          SELECT primaryChannelName as name, COUNT(*) as count
          FROM movies
          WHERE primaryChannelName IS NOT NULL
          GROUP BY primaryChannelName
          ORDER BY count DESC, primaryChannelName ASC
        `,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      self.postMessage({ id, genres, countries, channels })
    } else if (type === 'get-movie-count') {
      const { where = '', params = [] } = e

      let sql = `SELECT COUNT(*) as count FROM movies m`
      if (where) sql += ` WHERE ${where}`

      const result = db.exec({
        sql,
        bind: params,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      const firstRow = result[0] as { count: number } | undefined
      self.postMessage({ id, count: firstRow?.count || 0 })
    }
  } catch (err: unknown) {
    console.error('Worker error:', err)
    self.postMessage({ id, error: (err as Error).message || String(err) })
  }
}
