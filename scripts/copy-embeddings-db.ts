/**
 * Copy embedding database files to public directory
 * This script copies pre-generated embedding databases from data/ to public/data/
 * for client-side vector search functionality.
 */

import { copyFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const SOURCE_DIR = join(process.cwd(), 'data')
const TARGET_DIR = join(process.cwd(), 'public/data')

const EMBEDDING_DBS = [
  'embeddings-nomic-movies.db',
  'embeddings-bge-micro-movies.db',
  'embeddings-potion-movies.db',
]

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

async function copyEmbeddingDbs() {
  try {
    // Create target directory if it doesn't exist
    if (!existsSync(TARGET_DIR)) {
      await mkdir(TARGET_DIR, { recursive: true })
      console.log('Created directory:', TARGET_DIR)
    }

    let copiedCount = 0
    let skippedCount = 0

    // Copy each embedding database
    for (const file of EMBEDDING_DBS) {
      const source = join(SOURCE_DIR, file)
      const target = join(TARGET_DIR, file)

      if (!existsSync(source)) {
        console.warn(`Warning: Source file not found: ${source}`)
        skippedCount++
        continue
      }

      const sourceStats = await stat(source)
      const size = formatSize(sourceStats.size)

      // Check if target exists and is up to date
      if (existsSync(target)) {
        const targetStats = await stat(target)
        if (targetStats.mtime >= sourceStats.mtime && targetStats.size === sourceStats.size) {
          console.log(`Skipped (up to date): ${file} (${size})`)
          skippedCount++
          continue
        }
      }

      console.log(`Copying: ${file} (${size})...`)
      await copyFile(source, target)
      console.log(`Copied: ${file}`)
      copiedCount++
    }

    console.log(`\nEmbedding DB copy complete: ${copiedCount} copied, ${skippedCount} skipped`)
  } catch (error) {
    console.error('Failed to copy embedding DB files:', error)
    process.exit(1)
  }
}

copyEmbeddingDbs()
