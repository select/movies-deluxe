import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

let db: any = null
let sqlite3: any = null

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
  await initDatabase()

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
    db = new sqlite3.oo1.DB(':memory:')
    console.log('Created in-memory database')

    // Log database pointer info
    console.log('Database pointer:', db.pointer)
    console.log('Database size:', uint8Array.byteLength, 'bytes')

    // Check if sqlite3_deserialize is available
    if (typeof sqlite3.capi.sqlite3_deserialize !== 'function') {
      console.error('sqlite3_deserialize is not available!')
      console.log(
        'Available capi methods:',
        Object.keys(sqlite3.capi).filter(k => k.includes('deserialize'))
      )
      throw new Error('sqlite3_deserialize is not available in this SQLite build')
    }

    // Allocate memory using sqlite3_malloc (required for deserialize)
    // Use the regular malloc, not malloc64, to avoid BigInt issues
    const pMem = sqlite3.capi.sqlite3_malloc(uint8Array.byteLength)
    if (!pMem) {
      throw new Error('Failed to allocate memory for database')
    }
    console.log('Allocated memory at pointer:', pMem, 'size:', uint8Array.byteLength)

    // Copy the database content to the allocated memory
    try {
      sqlite3.wasm.heap8u().set(uint8Array, pMem)
      console.log('Copied database to WASM memory successfully')
    } catch (err) {
      console.error('Failed to copy to WASM memory:', err)
      throw err
    }

    // Log flags
    const flags =
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY
    console.log('Deserialize flags:', {
      FREEONCLOSE: sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
      READONLY: sqlite3.capi.SQLITE_DESERIALIZE_READONLY,
      combined: flags,
    })

    // Deserialize the database content into the in-memory database
    console.log('Calling sqlite3_deserialize with:', {
      dbPointer: db.pointer,
      schema: 'main',
      pMem,
      size: uint8Array.byteLength,
      maxSize: uint8Array.byteLength,
      flags,
    })

    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      pMem,
      uint8Array.byteLength,
      uint8Array.byteLength,
      flags
    )

    console.log('sqlite3_deserialize returned:', rc, 'SQLITE_OK:', sqlite3.capi.SQLITE_OK)

    if (rc !== sqlite3.capi.SQLITE_OK) {
      const errMsg = sqlite3.capi.sqlite3_errmsg(db.pointer)
      const errCode = sqlite3.capi.sqlite3_extended_errcode(db.pointer)
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

    console.log('Database loaded successfully, movies count:', testResult[0]?.count)
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
    } else if (type === 'exec') {
      if (!db) {
        throw new Error('Database not initialized. Call init first.')
      }

      const result = db.exec({
        sql,
        bind: params,
        returnValue: 'resultRows',
        rowMode: 'object',
      })
      self.postMessage({ id, result })
    } else if (type === 'query') {
      if (!db) {
        throw new Error('Database not initialized. Call init first.')
      }

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

      console.log('Worker executing SQL:', sql)
      console.log('Worker params:', params)

      const result = db.exec({
        sql,
        bind: params,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      console.log('Worker query result length:', result.length)

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
        totalCount = countResult[0]?.count
      }

      self.postMessage({ id, result, totalCount })
    } else if (type === 'query-lightweight') {
      // Lightweight query for IDs and titles only (no joins, minimal data)
      if (!db) {
        throw new Error('Database not initialized. Call init first.')
      }

      const { where = '', params = [], orderBy = '', limit, offset, includeCount = false } = e.data

      // Only select imdbId, title, and year for lightweight queries
      let sql = `SELECT m.imdbId, m.title, m.year FROM movies m`
      if (where) sql += ` WHERE ${where}`
      if (orderBy) sql += ` ORDER BY ${orderBy}`
      if (limit !== undefined) sql += ` LIMIT ${limit}`
      if (offset !== undefined) sql += ` OFFSET ${offset}`

      console.log('Worker executing lightweight SQL:', sql)
      console.log('Worker params:', params)

      const result = db.exec({
        sql,
        bind: params,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      console.log('Worker lightweight query result length:', result.length)

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
        totalCount = countResult[0]?.count
      }

      self.postMessage({ id, result, totalCount })
    } else if (type === 'query-by-ids') {
      // Query full movie details for specific IDs
      if (!db) {
        throw new Error('Database not initialized. Call init first.')
      }

      const { imdbIds } = e.data

      if (!imdbIds || imdbIds.length === 0) {
        self.postMessage({ id, result: [] })
        return
      }

      const placeholders = imdbIds.map(() => '?').join(',')
      const sql = `
        SELECT m.*, GROUP_CONCAT(s.type || '|' || s.url || '|' || COALESCE(s.identifier, '') || '|' || COALESCE(s.label, '') || '|' || COALESCE(s.quality, '') || '|' || s.addedAt || '|' || COALESCE(s.description, '') || '|' || COALESCE(s.youtube_channelName, ''), '###') as sources_raw
        FROM movies m
        LEFT JOIN sources s ON m.imdbId = s.movieId
        WHERE m.imdbId IN (${placeholders})
        GROUP BY m.imdbId
      `

      console.log('Worker executing query-by-ids SQL:', sql)
      console.log('Worker params:', imdbIds)

      const result = db.exec({
        sql,
        bind: imdbIds,
        returnValue: 'resultRows',
        rowMode: 'object',
      })

      console.log('Worker query-by-ids result length:', result.length)

      self.postMessage({ id, result })
    }
  } catch (err: any) {
    console.error('Worker error:', err)
    self.postMessage({ id, error: err.message || String(err) })
  }
}
