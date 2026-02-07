import { loadMoviesDatabase, saveMoviesDatabase } from '../server/utils/movieData'
import { SourceQualityMark, type MovieEntry, type MovieSource } from '../shared/types/movie'

/**
 * Detection criteria for poor metadata
 */
interface DetectionResult {
  hasIssue: boolean
  reasons: string[]
}

/**
 * Check if a string is numeric-only (with optional whitespace)
 */
function isNumericOnly(str: string): boolean {
  return /^\s*\d+\s*$/.test(str)
}

/**
 * Normalize string field (handles array values)
 */
function normalizeString(value: string | string[] | undefined): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0] || ''
  if (typeof value !== 'string') return String(value)
  return value
}

/**
 * Detect poor metadata in a source
 */
function detectPoorMetadata(source: MovieSource): DetectionResult {
  const reasons: string[] = []
  const title = normalizeString(source.title as string | string[]).trim()
  const description = normalizeString(source.description as string | string[]).trim()

  const titleIsNumeric = isNumericOnly(title)
  const descriptionIsNumeric = isNumericOnly(description)
  const hasNoDescription = !description || description.length === 0

  // 1. Numeric-only title with no description
  if (titleIsNumeric && hasNoDescription) {
    reasons.push(`numeric-only title with no description: "${title}"`)
  }

  // 2. Numeric-only in both title AND description
  if (titleIsNumeric && descriptionIsNumeric) {
    reasons.push(`numeric-only in both title and description: "${title}" / "${description}"`)
  }

  return {
    hasIssue: reasons.length > 0,
    reasons,
  }
}

/**
 * Main function to detect and mark sources with poor metadata
 */
async function detectPoorMetadataMain() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose')

  console.log(`Loading database...${dryRun ? ' (DRY RUN)' : ''}`)
  const db = await loadMoviesDatabase()
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))

  let sourcesChecked = 0
  let sourcesMarked = 0
  let sourcesAlreadyMarked = 0
  let moviesAffected = 0

  const stats = {
    numericTitleNoDesc: 0,
    numericBoth: 0,
  }

  for (const [id, entry] of entries) {
    const movie = entry as MovieEntry
    let movieModified = false

    for (const source of movie.sources) {
      sourcesChecked++

      // Check if already marked with poor-metadata
      const existingMarks = source.qualityMarks || []
      if (existingMarks.includes(SourceQualityMark.POOR_METADATA)) {
        sourcesAlreadyMarked++
        continue
      }

      const detection = detectPoorMetadata(source)

      if (detection.hasIssue) {
        // Update stats
        for (const reason of detection.reasons) {
          if (reason.includes('no description')) stats.numericTitleNoDesc++
          if (reason.includes('both title and description')) stats.numericBoth++
        }

        if (verbose) {
          console.log(`\n[${id}] "${movie.title}"`)
          console.log(`  Source: "${source.title}" (${source.type})`)
          console.log(`  Reasons: ${detection.reasons.join(', ')}`)
        }

        if (!dryRun) {
          source.qualityMarks = [...existingMarks, SourceQualityMark.POOR_METADATA]
          movieModified = true
        }

        sourcesMarked++
      }
    }

    if (movieModified) {
      movie.lastUpdated = new Date().toISOString()
      moviesAffected++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log('Detection complete.')
  console.log(`${'='.repeat(50)}`)
  console.log(`\nSources checked: ${sourcesChecked}`)
  console.log(`Sources marked: ${sourcesMarked}`)
  console.log(`Sources already marked: ${sourcesAlreadyMarked}`)
  console.log(`Movies affected: ${moviesAffected}`)
  console.log(`\nBreakdown by issue type:`)
  console.log(`  - Numeric-only title with no description: ${stats.numericTitleNoDesc}`)
  console.log(`  - Numeric-only in both title and description: ${stats.numericBoth}`)

  if (!dryRun && sourcesMarked > 0) {
    console.log('\nSaving database...')
    await saveMoviesDatabase(db)
    console.log('Database saved.')
  } else if (dryRun) {
    console.log('\n(DRY RUN - no changes saved)')
  }
}

detectPoorMetadataMain().catch(err => {
  console.error('Error during poor metadata detection:', err)
  process.exit(1)
})
