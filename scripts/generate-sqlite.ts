/**
 * SQLite Database Generation Script
 *
 * Converts data/movies.json to public/data/movies.db
 * Optimized for client-side SQLite Wasm usage.
 */

import { generateSQLite } from '../server/utils/generateSQLite'

// Run the generation
generateSQLite().catch(err => {
  console.error(err)
  process.exit(1)
})
