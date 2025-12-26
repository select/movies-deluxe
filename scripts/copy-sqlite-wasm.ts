/**
 * Copy SQLite WASM files to public directory
 * This script runs after npm/pnpm install to ensure WASM files are available
 */

import { copyFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const SOURCE_DIR = join(
  process.cwd(),
  'node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm'
)
const TARGET_DIR = join(process.cwd(), 'public/sqlite-wasm')

const FILES = ['sqlite3.wasm', 'sqlite3.js']

async function copyWasmFiles() {
  try {
    // Create target directory if it doesn't exist
    if (!existsSync(TARGET_DIR)) {
      await mkdir(TARGET_DIR, { recursive: true })
      console.log('Created directory:', TARGET_DIR)
    }

    // Copy each file
    for (const file of FILES) {
      const source = join(SOURCE_DIR, file)
      const target = join(TARGET_DIR, file)

      if (!existsSync(source)) {
        console.warn(`Warning: Source file not found: ${source}`)
        continue
      }

      await copyFile(source, target)
      console.log(`Copied: ${file}`)
    }

    console.log('SQLite WASM files copied successfully!')
  } catch (error) {
    console.error('Failed to copy SQLite WASM files:', error)
    process.exit(1)
  }
}

copyWasmFiles()
