import sqlite3InitModule from 'sqlite-wasm-vec'
import type { SQLite3, SQLiteDatabase } from '~/types/sqlite-wasm'

// SqlValue type from sqlite-wasm
type _SqlValue = string | number | null | bigint | Uint8Array | Int8Array | ArrayBuffer

let db: SQLiteDatabase | null = null
let sqlite3: SQLite3 | null = null
let initializationPromise: Promise<void> | null = null

// Base URL for loading WASM files (set during init)
let baseURL = '/'

// Cache for movie data to avoid re-fetching
const movieCache = new Map<string, Record<string, unknown>>()

// Cache for embedding dimensions from database metadata
let cachedDimensions: number | null = null

// Track attached embeddings database state
let embeddingsDbAttached = false
// Memory pointer kept for potential future cleanup (FREEONCLOSE handles deallocation on detach)
let _embeddingsDbMemoryPointer: number | null = null

async function initDatabase() {
  if (sqlite3) return sqlite3

  try {
    sqlite3 = await sqlite3InitModule({
      print: (...args: string[]) => console.log(...args),
      printErr: (...args: string[]) => console.error(...args),
      locateFile: (file: string) => {
        // Point to the WASM file in the public directory, respecting base URL
        if (file.endsWith('.wasm')) {
          return `${baseURL}sqlite-wasm/${file}`
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
    const movieCount = firstRow?.count || 0
    console.log('Database loaded successfully, movies count:', movieCount)
    return movieCount
  } catch (err) {
    console.error('Failed to load remote database:', err)
    throw err
  }
}

// Message queue to ensure sequential processing
interface QueuedMessage {
  type:
    | 'init'
    | 'exec'
    | 'query-by-ids'
    | 'vector-search'
    | 'attach-embeddings'
    | 'detach-embeddings'
  id: string
  // For init, attach-embeddings
  url?: string
  baseURL?: string
  // For exec, query-by-ids, vector-search (pre-built SQL)
  sql?: string
  params?: (string | number)[]
  // For query-by-ids
  movieIds?: string[]
  // For vector-search
  embedding?: Float32Array | number[]
  limit?: number
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
  const { type, sql, params, id, url, baseURL: msgBaseURL } = e

  try {
    if (type === 'init') {
      if (initializationPromise) {
        await initializationPromise
        self.postMessage({ id, type: 'init-success', success: true })
        return
      }

      // Set base URL for WASM file loading (must be set before initDatabase)
      if (msgBaseURL) {
        baseURL = msgBaseURL
      }

      let totalMovies = 0

      initializationPromise = (async () => {
        await initDatabase()
        if (url) {
          totalMovies = await loadRemoteDatabase(url)

          // Fetch embedding dimensions from config table if it exists
          if (db) {
            try {
              const rows = db.exec({
                sql: "SELECT value FROM config WHERE key = 'embedding_dimensions'",
                returnValue: 'resultRows',
                rowMode: 'object',
              })
              if (rows.length > 0) {
                const value = (rows[0] as { value: string }).value
                cachedDimensions = parseInt(value, 10)
                console.log('Detected embedding dimensions from DB config:', cachedDimensions)
              }
            } catch (err) {
              console.warn('Could not fetch embedding_dimensions from config table:', err)
            }
          }
        }
      })()

      await initializationPromise
      self.postMessage({ id, type: 'init-success', success: true, totalMovies })
      return
    }

    // Handle attach-embeddings message
    if (type === 'attach-embeddings') {
      // Wait for initialization if it's in progress
      if (initializationPromise) {
        await initializationPromise
      }

      if (!db || !sqlite3) {
        throw new Error('Main database not initialized. Call init first.')
      }

      if (!url) {
        throw new Error('URL is required to attach embeddings database')
      }

      // Detach existing embeddings database if attached
      if (embeddingsDbAttached) {
        try {
          db.exec({ sql: 'DETACH DATABASE embeddings_db' })
          embeddingsDbAttached = false
          // Note: We don't free the old memory pointer here because SQLITE_DESERIALIZE_FREEONCLOSE
          // should handle it when the database is detached
          _embeddingsDbMemoryPointer = null
          console.log('Detached existing embeddings database before re-attaching')
        } catch (err) {
          console.warn('Failed to detach existing embeddings database:', err)
        }
      }

      try {
        console.log('Fetching embeddings database from:', url)
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(
            `Failed to fetch embeddings database: ${response.status} ${response.statusText}`
          )
        }

        const arrayBuffer = await response.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)

        // First, attach an empty in-memory database with the alias 'embeddings_db'
        db.exec({ sql: "ATTACH DATABASE ':memory:' AS embeddings_db" })

        // Allocate memory for the embeddings database
        const pMem = sqlite3.capi.sqlite3_malloc(uint8Array.byteLength)
        if (!pMem) {
          // Detach the empty database on failure
          db.exec({ sql: 'DETACH DATABASE embeddings_db' })
          throw new Error('Failed to allocate memory for embeddings database')
        }

        // Store the memory pointer for potential cleanup
        _embeddingsDbMemoryPointer = pMem

        // Copy the database content to the allocated memory
        sqlite3.wasm.heap8u().set(uint8Array, pMem)

        const flags =
          sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY

        // Deserialize into the attached database
        const rc = sqlite3.capi.sqlite3_deserialize(
          db.pointer,
          'embeddings_db',
          pMem,
          uint8Array.byteLength,
          uint8Array.byteLength,
          flags
        )

        if (rc !== sqlite3.capi.SQLITE_OK) {
          const errMsg = sqlite3.capi.sqlite3_errmsg(db.pointer)
          // Detach on failure
          try {
            db.exec({ sql: 'DETACH DATABASE embeddings_db' })
          } catch {
            // Ignore detach errors during cleanup
          }
          _embeddingsDbMemoryPointer = null
          throw new Error(`Failed to deserialize embeddings database: ${errMsg}`)
        }

        embeddingsDbAttached = true

        // Try to fetch embedding dimensions from the embeddings database config
        try {
          const rows = db.exec({
            sql: "SELECT value FROM embeddings_db.config WHERE key = 'embedding_dimensions'",
            returnValue: 'resultRows',
            rowMode: 'object',
          })
          if (rows.length > 0) {
            const value = (rows[0] as { value: string }).value
            cachedDimensions = parseInt(value, 10)
            console.log('Updated embedding dimensions from embeddings DB config:', cachedDimensions)
          }
        } catch (err) {
          console.warn('Could not fetch embedding_dimensions from embeddings_db.config table:', err)
        }

        // Verify the embeddings database loaded correctly
        let embeddingsCount = 0
        try {
          const testResult = db.exec({
            sql: 'SELECT COUNT(*) as count FROM embeddings_db.movie_embeddings',
            returnValue: 'resultRows',
            rowMode: 'object',
          })
          const firstRow = testResult[0] as { count: number } | undefined
          embeddingsCount = firstRow?.count || 0
        } catch {
          // Table might not exist or have different name
          console.warn('Could not count embeddings - table may not exist')
        }

        console.log('Embeddings database attached successfully, embeddings count:', embeddingsCount)
        self.postMessage({ id, type: 'attach-success', success: true, embeddingsCount })
      } catch (err) {
        console.error('Failed to attach embeddings database:', err)
        self.postMessage({ id, error: (err as Error).message || String(err) })
      }
      return
    }

    // Handle detach-embeddings message
    if (type === 'detach-embeddings') {
      // Wait for initialization if it's in progress
      if (initializationPromise) {
        await initializationPromise
      }

      if (!db) {
        throw new Error('Database not initialized. Call init first.')
      }

      if (!embeddingsDbAttached) {
        self.postMessage({ id, type: 'detach-success', success: true, wasAttached: false })
        return
      }

      try {
        db.exec({ sql: 'DETACH DATABASE embeddings_db' })
        embeddingsDbAttached = false
        _embeddingsDbMemoryPointer = null

        // Reset cached dimensions since they may have come from embeddings DB
        cachedDimensions = null

        // Try to re-fetch dimensions from main database
        try {
          const rows = db.exec({
            sql: "SELECT value FROM config WHERE key = 'embedding_dimensions'",
            returnValue: 'resultRows',
            rowMode: 'object',
          })
          if (rows.length > 0) {
            const value = (rows[0] as { value: string }).value
            cachedDimensions = parseInt(value, 10)
          }
        } catch {
          // Config table may not exist in main DB
        }

        console.log('Embeddings database detached successfully')
        self.postMessage({ id, type: 'detach-success', success: true, wasAttached: true })
      } catch (err) {
        console.error('Failed to detach embeddings database:', err)
        self.postMessage({ id, error: (err as Error).message || String(err) })
      }
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
    } else if (type === 'query-by-ids') {
      // Query lightweight movie details for specific IDs
      // Receives pre-built SQL from the store via useDatabase composable
      const { movieIds, sql: prebuiltSql, params: prebuiltParams } = e

      if (!movieIds || movieIds.length === 0) {
        self.postMessage({ id, result: [] })
        return
      }

      if (!prebuiltSql || !prebuiltParams) {
        self.postMessage({ id, error: 'Pre-built SQL and params are required for query-by-ids' })
        return
      }

      const results: Record<string, unknown>[] = []
      const idsToFetch: string[] = []

      // Check cache first
      for (const movieId of movieIds as string[]) {
        const cached = movieCache.get(movieId)
        if (cached) {
          results.push(cached)
        } else {
          idsToFetch.push(movieId)
        }
      }

      if (idsToFetch.length > 0) {
        const dbResults = db.exec({
          sql: prebuiltSql,
          bind: prebuiltParams as string[],
          returnValue: 'resultRows',
          rowMode: 'object',
        })

        // Transform and cache new results
        for (const row of dbResults) {
          const transformed = {
            ...row,
            verified: row.verified === 1,
          }
          movieCache.set(row.movieId as string, transformed)
          results.push(transformed)
        }
      }

      // Sort results to match the order of requested IDs
      const sortedResults = (movieIds as string[])
        .map(movieId => results.find(r => r.movieId === movieId))
        .filter(Boolean)

      self.postMessage({ id, result: sortedResults })
    } else if (type === 'vector-search') {
      // Vector similarity search
      // Receives pre-built SQL from the store, but handles embedding conversion here
      const { embedding, limit = 20, params: whereParams, sql: prebuiltSql } = e

      if (!embedding) {
        self.postMessage({ id, error: 'Embedding is required for vector search' })
        return
      }

      if (!prebuiltSql) {
        self.postMessage({ id, error: 'Pre-built SQL is required for vector-search' })
        return
      }

      // Convert embedding to Float32Array for sqlite-vec
      // Callers send either number[] (from API) or Float32Array
      let bindEmbedding: Float32Array
      if (Array.isArray(embedding)) {
        bindEmbedding = new Float32Array(embedding)
      } else if (embedding instanceof Float32Array) {
        bindEmbedding = embedding
      } else {
        self.postMessage({
          id,
          error: `Invalid embedding format: expected number[] or Float32Array`,
        })
        return
      }

      // Validate dimensions if we have them cached from DB metadata
      if (cachedDimensions !== null && bindEmbedding.length !== cachedDimensions) {
        self.postMessage({
          id,
          error: `Dimension mismatch: database expects ${cachedDimensions} dimensions, but received ${bindEmbedding.length}. Please check your embedding model configuration.`,
        })
        return
      }

      // sqlite-wasm-vec expects ArrayBuffer for vector binding, not Float32Array
      // Embedding and limit are always first two params
      const bindParams: (ArrayBuffer | number | string)[] = [
        bindEmbedding.buffer as ArrayBuffer,
        limit,
      ]

      // Add WHERE clause params if provided
      if (whereParams) {
        bindParams.push(...(whereParams as (string | number)[]))
      }

      const result = db.exec({
        sql: prebuiltSql,
        bind: bindParams,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      self.postMessage({ id, result })
    }
  } catch (err: unknown) {
    console.error('Worker error:', err)
    self.postMessage({ id, error: (err as Error).message || String(err) })
  }
}
