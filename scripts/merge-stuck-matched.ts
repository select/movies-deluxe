import 'dotenv/config'
import { closeAdminDatabase, getAdminDatabase } from '../server/utils/adminDb'
import { migrateMovieId } from '../server/utils/migrateMovieId'

interface StuckRow {
  movieId: string
  title: string
  reason: string | null
}

function extractUniqueImdbId(reason: string | null): string | null {
  if (!reason) return null
  const matches = reason.match(/\b(tt\d{7,})\b/g)
  if (!matches || matches.length === 0) return null
  const unique = new Set(matches)
  if (unique.size !== 1) return null
  return Array.from(unique)[0] ?? null
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  pnpm movies:merge-stuck [--dry-run]

Options:
  --dry-run   Simulate without mutating the database
  -h, --help  Show this help message`)
    return
  }

  const db = getAdminDatabase()

  const rows = db
    .prepare(
      `SELECT m.movieId, m.title, ma.reason
       FROM movies m
       JOIN match_attempts ma ON m.movieId = ma.movieId
       WHERE m.movieId NOT LIKE 'tt%'
         AND ma.outcome = 'matched'
       ORDER BY m.movieId ASC`
    )
    .all() as StuckRow[]

  const existsStmt = db.prepare('SELECT 1 FROM movies WHERE movieId = ?')

  let totalScanned = 0
  let merged = 0
  let migrated = 0
  let skippedAmbiguous = 0
  let failed = 0

  console.log(
    `[merge-stuck-matched] ${dryRun ? '[DRY RUN] ' : ''}Found ${rows.length} stuck matched movies`
  )

  for (const row of rows) {
    totalScanned++
    const targetImdbId = extractUniqueImdbId(row.reason)

    if (!targetImdbId) {
      skippedAmbiguous++
      if (skippedAmbiguous <= 20) {
        console.warn(
          `[merge-stuck-matched] Skipping ambiguous/missing IMDb ID for ${row.movieId}: ${row.reason ?? '(null)'}`
        )
      }
      continue
    }

    if (dryRun) {
      const targetExists = Boolean(existsStmt.get(targetImdbId))
      if (targetExists) {
        merged++
        if (merged <= 15) {
          console.log(
            `[DRY RUN] wouldMerge: ${row.movieId} (${row.title}) -> existing ${targetImdbId}`
          )
        }
      } else {
        migrated++
        if (migrated <= 15) {
          console.log(
            `[DRY RUN] wouldMigrate: ${row.movieId} (${row.title}) -> new ${targetImdbId}`
          )
        }
      }
      continue
    }

    const res = await migrateMovieId(row.movieId, targetImdbId, { mergeIfExists: true })
    if (!res.success) {
      failed++
      console.error(
        `[merge-stuck-matched] Failed ${row.movieId} -> ${targetImdbId}: ${res.message}`
      )
    } else if (res.merged) {
      merged++
    } else {
      migrated++
    }

    if (totalScanned % 500 === 0) {
      console.log(
        `[merge-stuck-matched] Progress: ${totalScanned}/${rows.length} (merged=${merged}, migrated=${migrated}, ambiguous=${skippedAmbiguous}, failed=${failed})`
      )
    }
  }

  console.log('')
  console.log(`=== Merge Stuck Matched Summary ${dryRun ? '(DRY RUN)' : '(APPLIED)'} ===`)
  console.log(`Total scanned:             ${totalScanned}`)
  console.log(`${dryRun ? 'Would merge into existing' : 'Merged into existing'} tt*: ${merged}`)
  console.log(`${dryRun ? 'Would migrate to new' : 'Migrated to new'} tt*:      ${migrated}`)
  console.log(`Skipped / ambiguous:       ${skippedAmbiguous}`)
  console.log(`Failed:                    ${failed}`)
}

main()
  .catch(err => {
    console.error('[merge-stuck-matched] Fatal error:', err)
    process.exitCode = 1
  })
  .finally(() => {
    closeAdminDatabase()
  })
