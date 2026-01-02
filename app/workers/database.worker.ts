import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { SQLite3, SQLiteDatabase } from '~/types/sqlite-wasm'

let db: SQLiteDatabase | null = null
let sqlite3: SQLite3 | null = null

async function initDatabase() {
  if (sqlite3) return sqlite3

  try {
    sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
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
    console.log('Database fetched, size:', arrayBuffer.byteLength, 'bytes')

    // Create a new Uint8Array from the buffer
    const uint8Array = new Uint8Array(arrayBuffer)

    // Close existing database if any
    if (db) {
      db.close()
      db = null
    }

    // Create a new in-memory database
    db = new sqlite.oo1.DB(':memory:')

    // Log database pointer info
    console.log('Database size:', uint8Array.byteLength, 'bytes')

    // Check if sqlite3_deserialize is available
    if (typeof sqlite.capi.sqlite3_deserialize !== 'function') {
      console.error('sqlite3_deserialize is not available!')
      throw new Error('sqlite3_deserialize is not available in this SQLite build')
    }

    // Allocate memory using sqlite3_malloc (required for deserialize)
    // Use the regular malloc, not malloc64, to avoid BigInt issues
    const pMem = sqlite.capi.sqlite3_malloc(uint8Array.byteLength)
    if (!pMem) {
      throw new Error('Failed to allocate memory for database')
    }
    console.log('Allocated memory at pointer:', pMem, 'size:', uint8Array.byteLength)

    // Copy the database content to the allocated memory
    try {
      sqlite.wasm.heap8u().set(uint8Array, pMem)
    } catch (err) {
      console.error('Failed to copy to WASM memory:', err)
      throw err
    }

    // Log flags
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
      const errCode = sqlite.capi.sqlite3_extended_errcode(db.pointer)
      console.error('Deserialize failed:', {
        returnCode: rc,
        errorMessage: errMsg,
        extendedErrorCode: errCode,
      })
      throw new Error(
        `Failed to deserialize database: ${errMsg} (code: ${rc}, extended: ${errCode})`
      )
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

self.onmessage = async e => {
  const { type, sql, params, id, url } = e.data

  try {
    if (type === 'init') {
      await initDatabase()
      if (url) {
        await loadRemoteDatabase(url)
      }
      self.postMessage({ id, success: true })
      return
    }

    // All other operations require initialized database
    if (!db) {
      throw new Error('Database not initialized. Call init first.')
    }

    if (type === 'exec') {
      const result = db.exec({
        sql,
        bind: params,
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
      } = e.data

      let sql = `SELECT ${select} FROM ${from}`
      if (where) sql += ` WHERE ${where}`
      if (groupBy) sql += ` GROUP BY ${groupBy}`
      if (orderBy) sql += ` ORDER BY ${orderBy}`
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
      // Lightweight query for IDs and titles only (no joins, minimal data)
      const { where = '', params = [], orderBy = '', limit, offset, includeCount = false } = e.data

      // Only select imdbId, title, and year for lightweight queries
      let sql = `SELECT m.imdbId, m.title, m.year FROM movies m`
      if (where) sql += ` WHERE ${where}`
      if (orderBy) sql += ` ORDER BY ${orderBy}`
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
      // Query full movie details for specific IDs
      const { imdbIds } = e.data

      if (!imdbIds || imdbIds.length === 0) {
        self.postMessage({ id, result: [] })
        return
      }

      const placeholders = imdbIds.map(() => '?').join(',')
      const sql = `
        SELECT m.*, GROUP_CONCAT(s.type || '|||' || COALESCE(s.identifier, '') || '|||' || COALESCE(s.title, '') || '|||' || s.addedAt || '|||' || COALESCE(s.description, '') || '|||' || COALESCE(c.name, ''), '###') as sources_raw
        FROM movies m
        LEFT JOIN sources s ON m.imdbId = s.movieId
        LEFT JOIN channels c ON s.channelId = c.id
        WHERE m.imdbId IN (${placeholders})
        GROUP BY m.imdbId
      `

      const result = db.exec({
        sql,
        bind: imdbIds,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      self.postMessage({ id, result })
    } else if (type === 'query-related') {
      // Query related movies for a specific ID
      const { imdbId, limit = 8 } = e.data

      const sql = `
        SELECT m.imdbId, m.title, m.year, r.score
        FROM related_movies r
        JOIN movies m ON r.relatedMovieId = m.imdbId
        WHERE r.movieId = ?
        ORDER BY r.score DESC
        LIMIT ?
      `

      const result = db.exec({
        sql,
        bind: [imdbId, limit],
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      self.postMessage({ id, result })
    } else if (type === 'query-collections-for-movie') {
      // Query collections for a specific movie
      const { movieId } = e.data

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
          SELECT c.id, c.name, COUNT(s.id) as count
          FROM channels c
          LEFT JOIN sources s ON s.channelId = c.id
          GROUP BY c.id, c.name
          ORDER BY c.name ASC
        `,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      self.postMessage({ id, genres, countries, channels })
    }
  } catch (err: unknown) {
    console.error('Worker error:', err)
    self.postMessage({ id, error: (err as Error).message || String(err) })
  }
}
