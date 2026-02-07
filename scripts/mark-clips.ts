import { getAdminDatabase } from '../server/utils/adminDb'
import { QualityLabel } from '../shared/types/movie'

/**
 * Mark movies as 'clip' based on file size and genre criteria
 *
 * Criteria:
 * 1. Have a tt (IMDb) ID
 * 2. Do NOT have the 'short' genre
 * 3. Have a file size below 100MB
 */
function markClips() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose')

  console.log(`Loading database...${dryRun ? ' (DRY RUN)' : ''}`)
  const db = getAdminDatabase()

  // Get all movies with tt IDs (IMDb IDs)
  const movies = db
    .prepare(
      `
      SELECT m.movieId, m.title, md.Genre
      FROM movies m
      LEFT JOIN metadata md ON m.movieId = md.movieId
      WHERE m.movieId LIKE 'tt%'
    `
    )
    .all() as Array<{
    movieId: string
    title: string
    Genre: string | null
  }>

  let markedCount = 0
  const SIZE_THRESHOLD = 100 * 1024 * 1024 // 100MB in bytes
  const COMMIT_BATCH_SIZE = 100

  console.log(`Processing ${movies.length} movies...`)

  // Prepare statements for reuse
  const getLabelsStmt = db.prepare('SELECT label FROM movie_quality_labels WHERE movieId = ?')
  const getSmallFilesStmt = db.prepare(`
    SELECT sourceId, fileSize, size
    FROM sources
    WHERE movieId = ? AND (fileSize < ? OR size < ?)
    LIMIT 1
  `)
  const insertLabelStmt = db.prepare(`
    INSERT OR IGNORE INTO movie_quality_labels (movieId, label, addedAt)
    VALUES (?, ?, ?)
  `)
  const updateMovieStmt = db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')

  // Create transaction for batch inserts
  const insertClipLabel = db.transaction((movieId: string) => {
    const now = new Date().toISOString()
    insertLabelStmt.run(movieId, QualityLabel.CLIP, now)
    updateMovieStmt.run(now, movieId)
  })

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i]

    // Check if movie has 'short' genre
    const hasShortGenre = movie.Genre?.toLowerCase().includes('short') ?? false

    // Skip if it has 'short' genre
    if (hasShortGenre) {
      continue
    }

    // Check if any source has file size below threshold
    const smallFiles = getSmallFilesStmt.get(movie.movieId, SIZE_THRESHOLD, SIZE_THRESHOLD) as
      | { sourceId: string; fileSize: number | null; size: number | null }
      | undefined

    // Skip if no small files found
    if (!smallFiles) {
      continue
    }

    // Check existing quality labels
    const qualityLabels = (getLabelsStmt.all(movie.movieId) as Array<{ label: string }>).map(
      row => row.label as QualityLabel
    )

    // Skip if already marked as clip
    if (qualityLabels.includes(QualityLabel.CLIP)) {
      continue
    }

    if (verbose) {
      const fileSize = smallFiles.fileSize || smallFiles.size || 0
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
      console.log(
        `Marking ${movie.movieId} ("${movie.title}") as clip - smallest file: ${sizeMB}MB`
      )
    }

    if (!dryRun) {
      insertClipLabel(movie.movieId)
    }

    markedCount++

    // Progress reporting
    if ((i + 1) % COMMIT_BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${movies.length} movies processed`)
    }
  }

  console.log(`\nDetection complete.`)
  console.log(`Movies checked: ${movies.length}`)
  console.log(`Movies marked as clips: ${markedCount}`)
}

try {
  markClips()
} catch (err) {
  console.error('Error during clip detection:', err)
  process.exit(1)
}
