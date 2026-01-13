/**
 * TypeScript definitions for @sqlite.org/sqlite-wasm
 *
 * Re-exports and type aliases for the SQLite WASM library.
 * The library provides official TypeScript types.
 */

import type sqlite3InitModule from 'sqlite-wasm-vec'

/**
 * The SQLite3 static object returned by the init module
 */
export type SQLite3 = Awaited<ReturnType<typeof sqlite3InitModule>>

/**
 * The Database class from oo1 API
 */
export type SQLiteDatabase = InstanceType<SQLite3['oo1']['DB']>

/**
 * The C API interface
 */
export type SQLiteCAPI = SQLite3['capi']

/**
 * The WASM utilities interface
 */
export type SQLiteWASM = SQLite3['wasm']
