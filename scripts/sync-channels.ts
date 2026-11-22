#!/usr/bin/env node
/**
 * CLI for Channel Sync, Diffing, Availability Probing & Removal-Reason Tracking
 *
 * Usage:
 *   pnpm channels:sync [options]
 *
 * Options:
 *   --dry-run            Compute diff without writing to DB
 *   --channel <id>       Sync only the specified channel ID (repeatable)
 *   --platform <p>       youtube | archive | all (default: all)
 *   --retry-failed       Retry previously failed YouTube video IDs
 *   --probe-active       Also probe present YouTube videos (Stage 1 batch)
 */

import { config } from 'dotenv'
import { createLogger } from '../server/utils/logger'
import { syncChannels } from '../server/utils/channelSync'

config()

const logger = createLogger('SyncChannelsCLI')

function parseArgs(argv: string[]) {
  let dryRun = false
  let retryFailed = false
  let probeActive = false
  let platform: 'youtube' | 'archive' | 'all' = 'all'
  const channels: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--retry-failed') {
      retryFailed = true
    } else if (arg === '--probe-active') {
      probeActive = true
    } else if (arg === '--platform' && argv[i + 1]) {
      const val = argv[++i]
      if (val === 'youtube' || val === 'archive' || val === 'all') {
        platform = val
      } else {
        throw new Error(`Invalid --platform "${val}". Expected youtube | archive | all`)
      }
    } else if (arg === '--channel' && argv[i + 1]) {
      channels.push(argv[++i]!)
    }
  }

  return { dryRun, retryFailed, probeActive, platform, channels }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  logger.info(
    `Starting channel sync (platform=${opts.platform}, dryRun=${opts.dryRun}, retryFailed=${opts.retryFailed}, probeActive=${opts.probeActive})`
  )

  const result = await syncChannels({
    platform: opts.platform,
    channels: opts.channels.length > 0 ? opts.channels : undefined,
    dryRun: opts.dryRun,
    retryFailed: opts.retryFailed,
    probeActive: opts.probeActive,
    onProgress: progress => {
      logger.info(`[${progress.current}/${progress.total}] ${progress.message}`)
    },
  })

  console.log('\n=== CHANNEL SYNC SUMMARY ===')
  if (result.dryRun) {
    console.log('(DRY RUN - no database changes were written)')
  }

  const rows = result.channels.map(ch => ({
    Channel: ch.channelName,
    Platform: ch.platform,
    Remote: ch.totalRemote,
    InDB: ch.existingInDb,
    Added: ch.added,
    Removed: ch.removed,
    Restored: ch.restored,
    SkippedFailed: ch.skippedFailed,
    Probed: ch.probed,
    Reasons:
      Object.entries(ch.removalReasons)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ') || '-',
    Error: ch.error || '-',
  }))

  console.table(rows)
  console.log(
    `Totals: added=${result.totals.added}, removed=${result.totals.removed}, restored=${result.totals.restored}, skippedFailed=${result.totals.skippedFailed}, probed=${result.totals.probed}, errors=${result.totals.errors}`
  )

  if (!result.success) {
    process.exitCode = 1
  }
}

main().catch(error => {
  logger.error('Channel sync failed:', error)
  process.exit(1)
})
