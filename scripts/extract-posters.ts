/**
 * Extract Posters Script
 *
 * Checks if target directory is empty (or has only .gitkeep),
 * and if so, extracts all poster images from data/posters-part*.tar.gz
 * archives into the specified directory.
 *
 * Usage:
 *   pnpm tsx scripts/extract-posters.ts [output-path]
 *
 * Examples:
 *   pnpm tsx scripts/extract-posters.ts                    # Extract to public/posters
 *   pnpm tsx scripts/extract-posters.ts /tmp/posters       # Extract to /tmp/posters
 *   pnpm tsx scripts/extract-posters.ts ./custom/path     # Extract to custom/path
 */

import { join, resolve } from 'path'
import { readdirSync, existsSync, mkdirSync } from 'fs'
import { extract } from 'tar'
import { createLogger } from '../server/utils/logger'
import { glob } from 'glob'

const logger = createLogger('PosterExtract')

// Get output path from command line argument or use default
const customPath = process.argv[2]
const POSTERS_DIR = customPath
  ? resolve(process.cwd(), customPath)
  : join(process.cwd(), 'public/posters')
const DATA_DIR = join(process.cwd(), 'data')

async function extractPosters() {
  logger.info(`Target directory: ${POSTERS_DIR}`)
  logger.info('Checking posters directory...')

  // Create directory if it doesn't exist
  if (!existsSync(POSTERS_DIR)) {
    logger.info('Directory does not exist. Creating it...')
    mkdirSync(POSTERS_DIR, { recursive: true })
  }

  // Check if directory is empty (ignoring .gitkeep)
  const files = readdirSync(POSTERS_DIR).filter(f => f !== '.gitkeep')

  if (files.length > 0) {
    logger.info(`Directory already contains ${files.length} files. Skipping extraction.`)
    logger.info(`To force re-extraction, delete all files in ${POSTERS_DIR} (except .gitkeep)`)
    return
  }

  logger.info('Posters directory is empty. Starting extraction...')

  // Find all poster archive parts
  const archivePattern = join(DATA_DIR, 'posters-part*.tar.gz')
  const archives = await glob(archivePattern)

  if (archives.length === 0) {
    logger.warn('No poster archives found in data/ directory')
    logger.info('Expected files: data/posters-part01.tar.gz, data/posters-part02.tar.gz, etc.')
    return
  }

  logger.info(`Found ${archives.length} archive parts`)

  // Sort archives to extract in order
  archives.sort()

  // Extract each archive
  for (let i = 0; i < archives.length; i++) {
    const archive = archives[i]!
    const partNum = i + 1
    logger.info(`Extracting part ${partNum}/${archives.length}: ${archive}`)

    try {
      await extract({
        file: archive,
        cwd: POSTERS_DIR,
        strip: 0, // Don't strip any path components
      })
      logger.info(`✓ Extracted part ${partNum}/${archives.length}`)
    } catch (error) {
      logger.error(`Failed to extract ${archive}:`, error)
      throw error
    }
  }

  // Count extracted files
  const extractedFiles = readdirSync(POSTERS_DIR).filter(f => f !== '.gitkeep')
  logger.success(`Successfully extracted ${extractedFiles.length} poster files!`)
}

// Run the extraction
extractPosters().catch(err => {
  console.error(err)
  process.exit(1)
})
