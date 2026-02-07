import { getAdminDatabase } from '../server/utils/adminDb'
import { QualityLabel } from '../shared/types/movie'

function detectQualityIssues() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose')

  console.log(`Loading database...${dryRun ? ' (DRY RUN)' : ''}`)
  const db = getAdminDatabase()

  // Get all movies with their sources
  const movies = db.prepare('SELECT movieId, title FROM movies').all() as Array<{
    movieId: string
    title: string
  }>

  let markedCount = 0
  let totalIssues = 0
  const COMMIT_BATCH_SIZE = 100

  const keywords = [
    { label: QualityLabel.TRAILER, terms: ['trailer', 'official trailer'] },
    { label: QualityLabel.TEASER, terms: ['teaser'] },
    { label: QualityLabel.CLIP, terms: ['clip', 'scene from', 'movie clip'] },
    {
      label: QualityLabel.BEHIND_THE_SCENES,
      terms: ['behind the scenes', 'making of', 'featurette'],
    },
    { label: QualityLabel.INTERVIEW, terms: ['interview', 'cast interview'] },
    { label: QualityLabel.PROMO, terms: ['promo', 'tv spot', 'sneak peek'] },
  ]

  console.log(`Processing ${movies.length} movies...`)

  // Prepare statements for reuse
  const getLabelsStmt = db.prepare('SELECT label FROM movie_quality_labels WHERE movieId = ?')
  const getSourcesStmt = db.prepare('SELECT title, duration FROM sources WHERE movieId = ?')
  const insertLabelStmt = db.prepare(`
    INSERT OR IGNORE INTO movie_quality_labels (movieId, label, addedAt)
    VALUES (?, ?, ?)
  `)
  const updateMovieStmt = db.prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')

  // Create a transaction for batch inserts
  const insertLabels = db.transaction((movieId: string, labels: QualityLabel[]) => {
    const now = new Date().toISOString()
    for (const label of labels) {
      insertLabelStmt.run(movieId, label, now)
    }
    updateMovieStmt.run(now, movieId)
  })

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i]

    // Get existing quality labels
    const existingLabels = (getLabelsStmt.all(movie.movieId) as Array<{ label: string }>).map(
      row => row.label as QualityLabel
    )
    const newLabels = new Set<QualityLabel>(existingLabels)
    const initialLabelCount = newLabels.size

    // Get sources for this movie
    const sources = getSourcesStmt.all(movie.movieId) as Array<{
      title: string
      duration: number | null
    }>

    for (const source of sources) {
      const title = source.title.toLowerCase()
      const movieTitleLower = movie.title.toLowerCase()

      // Clean source title by removing the movie title to avoid false positives
      // (e.g. "Teaserama" containing "teaser")
      let sourceTitleClean = title
      if (sourceTitleClean.includes(movieTitleLower)) {
        sourceTitleClean = sourceTitleClean.replace(movieTitleLower, '').trim()
      }

      // 1. Keyword detection

      for (const { label, terms } of keywords) {
        if (
          terms.some(term => {
            // Check if the cleaned source title contains the term
            if (sourceTitleClean.includes(term)) return true

            // Also check the original title for multi-word strong indicators
            if (term.includes(' ') && title.includes(term)) return true

            return false
          })
        ) {
          newLabels.add(label)
        }
      }

      // 2. Duration detection (if duration is available)
      // If duration < 5 minutes (300s), it's likely a clip or trailer
      if (source.duration && source.duration > 0 && source.duration < 300) {
        // If it's not already marked as something specific, call it a clip
        if (
          !newLabels.has(QualityLabel.TRAILER) &&
          !newLabels.has(QualityLabel.TEASER) &&
          !newLabels.has(QualityLabel.PROMO) &&
          !newLabels.has(QualityLabel.INTERVIEW) &&
          !newLabels.has(QualityLabel.BEHIND_THE_SCENES)
        ) {
          newLabels.add(QualityLabel.CLIP)
        }
      }
    }

    if (newLabels.size > initialLabelCount) {
      const addedLabels = Array.from(newLabels).filter(l => !existingLabels.includes(l))

      if (verbose) {
        console.log(`Marking ${movie.movieId} ("${movie.title}"): ${addedLabels.join(', ')}`)
      }

      if (!dryRun) {
        // Add new quality labels using transaction
        insertLabels(movie.movieId, addedLabels)
      }

      markedCount++
      totalIssues += addedLabels.length
    }

    // Progress reporting
    if ((i + 1) % COMMIT_BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${movies.length} movies processed`)
    }
  }

  console.log(`\nDetection complete.`)
  console.log(`Movies checked: ${movies.length}`)
  console.log(`Movies with new issues: ${markedCount}`)
  console.log(`Total new labels: ${totalIssues}`)
}

try {
  detectQualityIssues()
} catch (err) {
  console.error('Error during quality detection:', err)
  process.exit(1)
}
