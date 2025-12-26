// @ts-expect-error - SQLite WASM library is loaded via importScripts
importScripts('/sqlite-wasm/sqlite3.js')

let db: any = null
let sqlite3: any = null

async function init() {
  if (db) return

  try {
    // @ts-expect-error - sqlite3InitModule is provided by the imported script
    sqlite3 = await sqlite3InitModule({
      print: () => {},
      printErr: () => {},
    })

    // Fetch the database file
    const response = await fetch('/data/movies.db')
    const buffer = await response.arrayBuffer()

    const p = sqlite3.wasm.allocFromTypedArray(buffer)
    db = new sqlite3.oo1.DB()

    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      p,
      buffer.byteLength,
      buffer.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY
    )

    if (rc !== 0) {
      throw new Error(`Failed to deserialize database: ${rc}`)
    }
  } catch (err) {
    throw err
  }
}

self.onmessage = async event => {
  const { type, payload, id } = event.data

  if (type === 'init') {
    try {
      await init()
      self.postMessage({ type: 'init', id, payload: { success: true } })
    } catch (err: any) {
      self.postMessage({ type: 'init', id, error: err.message })
    }
    return
  }

  if (!db) {
    self.postMessage({ type, id, error: 'Database not initialized' })
    return
  }

  try {
    if (type === 'query') {
      const { sql, params } = payload
      const rows = db.selectObjects(sql, params)
      self.postMessage({ type: 'query', id, payload: rows })
    } else if (type === 'exec') {
      const { sql, params } = payload
      db.exec(sql, { bind: params })
      self.postMessage({ type: 'exec', id, payload: { success: true } })
    }
  } catch (err: any) {
    self.postMessage({ type, id, error: err.message })
  }
}
