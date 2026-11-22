import { registerHooks } from 'node:module'
import type {
  AutoAuditFalseHitsResult,
  AutoCleanPreviewsResult,
  AutoMatchUnmatchedResult,
  AutoResolveFalseHitQueueResult,
} from '../server/utils/autoPipeline'

// Allow running server/utils/*.ts via tsx outside Nitro without failing on `nitropack/runtime`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'nitropack/runtime') {
      return { shortCircuit: true, url: 'nitropack-runtime-stub:' }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === 'nitropack-runtime-stub:') {
      return {
        shortCircuit: true,
        format: 'module',
        source: 'export function useRuntimeConfig() { return {} }\n',
      }
    }
    return nextLoad(url, context)
  },
})

type CliTask = 'clean-previews' | 'audit-false-hits' | 'resolve-false-hit-queue' | 'match-unmatched'

interface ParsedArgs {
  task: CliTask | null
  help: boolean
  dryRun: boolean
  limit?: number
  minConfidence?: number
  channel?: string
  allowGoogle: boolean
  rematch: boolean
  removeRedundant: boolean
  model?: string
}

function printUsage(): void {
  console.log(`Usage:
  pnpm tsx scripts/auto-pipeline.ts <task> [options]

Tasks:
  clean-previews           Clean Archive.org trailers/previews/subtitles (size + runtime aware)
  audit-false-hits         Audit matched movies, LLM-verify & auto-rematch/unmatch false hits
  resolve-false-hit-queue  Resolve pending false_hit items in match_review_queue
  match-unmatched          Match unmatched movies via IMDb index + TMDB + LLM adjudicator

Options:
  --apply                  Apply changes to the database (default is --dry-run)
  --dry-run                Simulate without mutating the database (default)
  --limit <N>              Max movies to scan
  --min-confidence <N>     Minimum LLM confidence for auto-apply (default: 0.85)
  --channel <NAME>         Filter by channelId/channel name (for match-unmatched)
  --allow-google           Allow Google Search fallback (<=100/day)
  --no-rematch             Disable auto-rematch during audit-false-hits
  --no-remove-redundant    Mark redundant previews incomplete instead of deleting
  --model <ID>             Override OpenRouter/LLM model ID
  -h, --help               Show this help message`)
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    task: null,
    help: false,
    dryRun: true,
    allowGoogle: false,
    rematch: true,
    removeRedundant: true,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg) continue

    if (arg === '-h' || arg === '--help') {
      parsed.help = true
    } else if (arg === '--apply') {
      parsed.dryRun = false
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--allow-google') {
      parsed.allowGoogle = true
    } else if (arg === '--no-rematch') {
      parsed.rematch = false
    } else if (arg === '--no-remove-redundant') {
      parsed.removeRedundant = false
    } else if (arg === '--limit') {
      const next = argv[++i]
      const val = next ? Number(next) : NaN
      if (!Number.isFinite(val) || val < 1) {
        throw new Error(`Invalid --limit value: ${next ?? '(missing)'}`)
      }
      parsed.limit = Math.floor(val)
    } else if (arg === '--min-confidence') {
      const next = argv[++i]
      const val = next ? Number(next) : NaN
      if (!Number.isFinite(val) || val < 0 || val > 1) {
        throw new Error(`Invalid --min-confidence value: ${next ?? '(missing)'}`)
      }
      parsed.minConfidence = val
    } else if (arg === '--channel') {
      const next = argv[++i]
      if (!next) throw new Error('Missing value for --channel')
      parsed.channel = next
    } else if (arg === '--model') {
      const next = argv[++i]
      if (!next) throw new Error('Missing value for --model')
      parsed.model = next
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    } else if (!parsed.task) {
      if (
        arg === 'clean-previews' ||
        arg === 'audit-false-hits' ||
        arg === 'resolve-false-hit-queue' ||
        arg === 'match-unmatched'
      ) {
        parsed.task = arg
      } else {
        throw new Error(`Unknown task: ${arg}`)
      }
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return parsed
}

function truncate(text: string | null | undefined, max = 42): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function printCleanPreviewsResult(res: AutoCleanPreviewsResult): void {
  console.log('\n=== Archive.org Preview Cleanup Summary ===')
  console.log(`Mode:              ${res.dryRun ? 'DRY RUN (no DB writes)' : 'APPLIED'}`)
  console.log(`Scanned Movies:    ${res.scannedMovies}`)
  console.log(`Scanned Sources:   ${res.scannedSources}`)
  console.log(`Removed Redundant: ${res.removedRedundant}`)
  console.log(`Marked Incomplete: ${res.markedIncomplete}`)
  console.log(`Skipped Cartoons:  ${res.skippedCartoons}`)
  console.log(`Queued Borderline: ${res.queuedBorderline}`)

  if (res.samples.length > 0) {
    console.log(`\nSample Actions (${res.samples.length}):`)
    console.table(
      res.samples.map(s => ({
        movieId: s.movieId,
        sourceId: truncate(s.sourceId, 28),
        title: truncate(s.title, 34),
        action: s.action,
        sizeMB: s.sizeMB !== null ? Number(s.sizeMB.toFixed(1)) : null,
        runtimeMin: s.runtimeMin,
        mbPerMin: s.mbPerMin !== null ? Number(s.mbPerMin.toFixed(2)) : null,
        flags: s.flags.join(','),
      }))
    )
  }
}

function printAuditFalseHitsResult(res: AutoAuditFalseHitsResult): void {
  console.log('\n=== False-Hit Audit Summary ===')
  console.log(`Mode:                  ${res.dryRun ? 'DRY RUN (no DB writes)' : 'APPLIED'}`)
  console.log(`Scanned:               ${res.scanned}`)
  console.log(`Deterministic Flagged: ${res.deterministicFlagged}`)
  console.log(`LLM Kept:              ${res.llmKept}`)
  console.log(`Auto-Rematched:        ${res.autoRematched}`)
  console.log(`Auto-Unmatched:        ${res.autoUnmatched}`)
  console.log(`Queued Uncertain:      ${res.queuedUncertain}`)

  if (res.samples.length > 0) {
    console.log(`\nSample Actions (${res.samples.length}):`)
    console.table(
      res.samples.map(s => ({
        movieId: s.movieId,
        title: truncate(s.title, 32),
        action: s.action,
        newMovieId: s.newMovieId || '',
        verdict: s.llmVerdict,
        conf: Number(s.llmConfidence.toFixed(2)),
        reason: truncate(s.llmReason, 40),
      }))
    )
  }
}

function printResolveFalseHitQueueResult(res: AutoResolveFalseHitQueueResult): void {
  console.log('\n=== False-Hit Queue Resolution Summary ===')
  console.log(`Mode:             ${res.dryRun ? 'DRY RUN (no DB writes)' : 'APPLIED'}`)
  console.log(`Scanned:          ${res.scanned}`)
  console.log(`Auto-Kept:        ${res.autoKept}`)
  console.log(`Auto-Rematched:   ${res.autoRematched}`)
  console.log(`Auto-Unmatched:   ${res.autoUnmatched}`)
  console.log(`Still Uncertain:  ${res.stillUncertain}`)
  console.log(`Already Resolved: ${res.alreadyResolved}`)
  console.log(`Errors:           ${res.errors}`)

  if (res.samples.length > 0) {
    console.log(`\nSample Actions (${res.samples.length}):`)
    console.table(
      res.samples.map(s => ({
        queueId: s.queueId,
        movieId: s.movieId,
        title: truncate(s.title, 32),
        action: s.action,
        newMovieId: s.newMovieId || '',
        verdict: s.llmVerdict,
        conf: Number(s.llmConfidence.toFixed(2)),
        reason: truncate(s.llmReason, 40),
      }))
    )
  }
}

function printMatchUnmatchedResult(res: AutoMatchUnmatchedResult): void {
  console.log('\n=== Unmatched Movies Auto-Match Summary ===')
  console.log(`Mode:                  ${res.dryRun ? 'DRY RUN (no DB writes)' : 'APPLIED'}`)
  console.log(`Scanned:               ${res.scanned}`)
  console.log(`Direct URL Matches:    ${res.directUrlMatches}`)
  console.log(`Deterministic Matches: ${res.deterministicMatches}`)
  console.log(`LLM Matches:           ${res.llmMatches}`)
  console.log(`Queued Uncertain:      ${res.queuedUncertain}`)
  console.log(`No Match:              ${res.noMatch}`)
  console.log(`Errors:                ${res.errors}`)

  if (res.samples.length > 0) {
    console.log(`\nSample Actions (${res.samples.length}):`)
    console.table(
      res.samples.map(s => ({
        oldMovieId: truncate(s.oldMovieId, 24),
        title: truncate(s.title, 32),
        action: s.action,
        imdbId: s.imdbId || '',
        matchedTitle: truncate(s.matchedTitle, 28),
        conf: s.confidence !== undefined ? Number(s.confidence.toFixed(2)) : '',
        reason: truncate(s.reason, 36),
      }))
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printUsage()
    return
  }

  if (!args.task) {
    printUsage()
    process.exitCode = 1
    return
  }

  console.log(
    `Running ${args.task} (${args.dryRun ? 'dry-run' : 'APPLY'})` +
      (args.limit ? ` [limit=${args.limit}]` : '') +
      '...'
  )

  const {
    runAutoAuditFalseHits,
    runAutoCleanArchivePreviews,
    runAutoMatchUnmatched,
    runAutoResolveFalseHitQueue,
  } = await import('../server/utils/autoPipeline')

  if (args.task === 'clean-previews') {
    const result = await runAutoCleanArchivePreviews({
      dryRun: args.dryRun,
      limit: args.limit,
      removeRedundant: args.removeRedundant,
    })
    printCleanPreviewsResult(result)
    return
  }

  if (args.task === 'audit-false-hits') {
    const result = await runAutoAuditFalseHits({
      dryRun: args.dryRun,
      limit: args.limit,
      minConfidence: args.minConfidence,
      rematch: args.rematch,
      allowGoogle: args.allowGoogle,
      model: args.model,
    })
    printAuditFalseHitsResult(result)
    return
  }

  if (args.task === 'resolve-false-hit-queue') {
    const result = await runAutoResolveFalseHitQueue({
      dryRun: args.dryRun,
      limit: args.limit,
      minConfidence: args.minConfidence,
      rematch: args.rematch,
      allowGoogle: args.allowGoogle,
      model: args.model,
    })
    printResolveFalseHitQueueResult(result)
    return
  }

  const result = await runAutoMatchUnmatched({
    dryRun: args.dryRun,
    limit: args.limit,
    channel: args.channel,
    minConfidence: args.minConfidence,
    allowGoogle: args.allowGoogle,
    model: args.model,
  })
  printMatchUnmatchedResult(result)
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
