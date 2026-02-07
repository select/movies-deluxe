import { getAdminDatabase } from '../server/utils/adminDb'
import { SourceQualityMark } from '../shared/types/movie'

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
function detectPoorMetadata(source: {
  title: string
  description: string | null
}): DetectionResult {
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
function detectPoorMetadataMain() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose')

  console.log(`Loading database...${dryRun ? ' (DRY RUN)' : ''}`)
  const db = getAdminDatabase()

  // Get all sources with their quality marks
  const sources = db
    .prepare(
      `
      SELECT 
        s.id,
        s.movieId,
        s.sourceId,
        s.title,
        s.description,
        s.type,
        m.title as movieTitle,
        GROUP_CONCAT(sqm.mark, '|') as marks
      FROM sources s
      JOIN movies m ON s.movieId = m.movieId
      LEFT JOIN source_quality_marks sqm ON s.id = sqm.sourceId
      GROUP BY s.id
    `
    )
    .all() as Array<{
    id: number
    movieId: string
    sourceId: string
    title: string
    description: string | null
    type: string
    movieTitle: string
    marks: string | null
  }>

  let sourcesChecked = 0
  let sourcesMarked = 0
  let sourcesAlreadyMarked = 0
  const moviesAffected = new Set<string>()
  const COMMIT_BATCH_SIZE = 100

  const stats = {
    numericTitleNoDesc: 0,
    numericBoth: 0,
  }

  console.log(`Processing ${sources.length} sources...`)

  // Prepare statements for reuse
  const insertMarkStmt = db.prepare(`
    INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt)
    VALUES (?, ?, ?)
  `)
  const updateMovieStmt = db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')

  // Create transaction for batch inserts
  const insertMark = db.transaction((sourceId: number, movieId: string) => {
    const now = new Date().toISOString()
    insertMarkStmt.run(sourceId, SourceQualityMark.POOR_METADATA, now)
    updateMovieStmt.run(now, movieId)
  })

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    sourcesChecked++

    // Check if already marked with poor-metadata
    const existingMarks = source.marks ? source.marks.split('|') : []
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
        console.log(`\n[${source.movieId}] "${source.movieTitle}"`)
        console.log(`  Source: "${source.title}" (${source.type})`)
        console.log(`  Reasons: ${detection.reasons.join(', ')}`)
      }

      if (!dryRun) {
        insertMark(source.id, source.movieId)
        moviesAffected.add(source.movieId)
      }

      sourcesMarked++
    }

    // Progress reporting
    if ((i + 1) % COMMIT_BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${sources.length} sources processed`)
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log('Detection complete.')
  console.log(`${'='.repeat(50)}`)
  console.log(`\nSources checked: ${sourcesChecked}`)
  console.log(`Sources marked: ${sourcesMarked}`)
  console.log(`Sources already marked: ${sourcesAlreadyMarked}`)
  console.log(`Movies affected: ${moviesAffected.size}`)
  console.log(`\nBreakdown by issue type:`)
  console.log(`  - Numeric-only title with no description: ${stats.numericTitleNoDesc}`)
  console.log(`  - Numeric-only in both title and description: ${stats.numericBoth}`)

  if (dryRun) {
    console.log('\n(DRY RUN - no changes saved)')
  }
}

try {
  detectPoorMetadataMain()
} catch (err) {
  console.error('Error during poor metadata detection:', err)
  process.exit(1)
}
