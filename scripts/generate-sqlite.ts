/**
 * SQLite Database Generation Script
 *
 * Converts data/movies.json to public/data/movies.db
 * Optimized for client-side SQLite Wasm usage.
 *
 * Note: Embeddings are stored separately in their own DB files
 * (e.g., embeddings-bge-micro-movies.db) and are generated via
 * the embeddings generation scripts or admin UI.
 */

import { parseArgs } from 'node:util'
import { generateSQLite } from '../server/utils/generateSQLite'

const { values } = parseArgs({
  options: {
    'skip-json': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: pnpm db:generate [options]

Options:
  --skip-json    Skip generating individual movie JSON files
  -h, --help     Show this help message

Examples:
  pnpm db:generate              # Generate database with JSON files
  pnpm db:generate --skip-json  # Skip JSON generation (faster)

Note: Embeddings are stored in separate database files and are
generated via 'pnpm embeddings:generate-*' commands or the admin UI.
  `)
  process.exit(0)
}

const skipJson = (values['skip-json'] as boolean) || false

// Run the generation
generateSQLite({
  skipJsonGeneration: skipJson,
  onProgress: progress => {
    console.log(`[${progress.current}/${progress.total}] ${progress.message}`)
  },
}).catch(err => {
  console.error(err)
  process.exit(1)
})
