/**
 * SQLite Database Generation Script
 *
 * Converts data/movies.json to public/data/movies.db
 * Optimized for client-side SQLite Wasm usage.
 */

import { parseArgs } from 'node:util'
import { generateSQLite } from '../server/utils/generateSQLite'
import { EMBEDDING_MODELS, getModelConfig, getDefaultModel } from '../config/embedding-models'

const { values } = parseArgs({
  options: {
    'embedding-model': { type: 'string', short: 'm' },
    'skip-json': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: pnpm db:generate [options]

Options:
  -m, --embedding-model <model>  Embedding model to use (nomic, bge-micro, potion)
  --skip-json                    Skip generating individual movie JSON files
  -h, --help                     Show this help message

Examples:
  pnpm db:generate                           # Use default model (nomic)
  pnpm db:generate -m bge-micro              # Use BGE model
  pnpm db:generate --skip-json               # Skip JSON generation
  pnpm db:generate -m potion --skip-json     # Use Potion, skip JSON
  `)
  process.exit(0)
}

const modelId = (values['embedding-model'] as string) || getDefaultModel().id
const modelConfig = getModelConfig(modelId)

if (!modelConfig) {
  console.error(`Error: Unknown embedding model '${modelId}'`)
  console.error(`Available models: ${EMBEDDING_MODELS.map(m => m.id).join(', ')}`)
  process.exit(1)
}

const skipJson = (values['skip-json'] as boolean) || false

// Run the generation
generateSQLite({
  embeddingModel: modelConfig,
  skipJsonGeneration: skipJson,
  onProgress: progress => {
    console.log(`[${progress.current}/${progress.total}] ${progress.message}`)
  },
}).catch(err => {
  console.error(err)
  process.exit(1)
})
