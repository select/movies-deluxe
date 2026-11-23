/**
 * Poster Cleanup Script
 *
 * Removes poster images in public/posters/ for movies that are no longer
 * listed in the catalog (or no longer present in the admin database).
 *
 * Usage:
 *   pnpm posters:cleanup [--dry-run] [--scope=listed|admin]
 *
 * Examples:
 *   pnpm posters:cleanup --dry-run
 *   pnpm posters:cleanup --scope=listed
 *   pnpm posters:cleanup --dry-run --scope=admin
 */

import { cleanupUnlistedPosters, type PosterCleanupScope } from '../server/utils/posterCleanup'
import { createLogger } from '../server/utils/logger'

const logger = createLogger('PosterCleanupCLI')

function parseCliArgs(argv: string[]): {
  dryRun: boolean
  scope: PosterCleanupScope
  help: boolean
} {
  let dryRun = false
  let scope: PosterCleanupScope = 'listed'
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--scope') {
      const value = argv[++i]
      if (value !== 'listed' && value !== 'admin') {
        throw new Error(`Invalid --scope value "${value ?? ''}". Expected "listed" or "admin".`)
      }
      scope = value
    } else if (arg.startsWith('--scope=')) {
      const value = arg.slice('--scope='.length)
      if (value !== 'listed' && value !== 'admin') {
        throw new Error(`Invalid --scope value "${value}". Expected "listed" or "admin".`)
      }
      scope = value
    } else {
      throw new Error(`Unknown argument "${arg}". Use --help for usage.`)
    }
  }

  return { dryRun, scope, help }
}

function main() {
  const { dryRun, scope, help } = parseCliArgs(process.argv.slice(2))

  if (help) {
    console.log(`
Usage: pnpm posters:cleanup [options]

Options:
  --dry-run             Preview posters that would be removed without deleting files
  --scope=listed|admin  Valid movie scope (default: listed)
  -h, --help            Show this help message
`)
    process.exit(0)
  }

  const result = cleanupUnlistedPosters({ dryRun, scope })
  const freedMb = (result.freedBytes / 1024 / 1024).toFixed(2)
  const actionLabel = result.dryRun ? 'Would remove' : 'Removed'

  logger.info(`Scope: ${result.scope}`)
  logger.info(`Total scanned: ${result.totalScanned}`)
  logger.info(`${actionLabel}: ${result.removedCount} (${freedMb} MB)`)
  logger.info(`Remaining: ${result.remainingCount}`)

  if (result.dryRun && result.sampleRemovedIds.length > 0) {
    logger.info(
      `Sample IDs (${result.sampleRemovedIds.length}): ${result.sampleRemovedIds.join(', ')}`
    )
  }
}

try {
  main()
} catch (err) {
  logger.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
