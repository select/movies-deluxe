import { loadMoviesDatabase, saveMoviesDatabase } from '../server/utils/movieData'
import { QualityLabel, type MovieEntry } from '../shared/types/movie'

async function detectQualityIssues() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose')

  console.log(`Loading database...${dryRun ? ' (DRY RUN)' : ''}`)
  const db = await loadMoviesDatabase()
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))

  let markedCount = 0
  let totalIssues = 0

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

  for (const [id, entry] of entries) {
    const movie = entry as MovieEntry
    const newLabels = new Set<QualityLabel>(movie.qualityLabels || [])
    const initialLabelCount = newLabels.size

    for (const source of movie.sources) {
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
      const addedLabels = Array.from(newLabels).filter(l => !movie.qualityLabels?.includes(l))

      if (verbose) {
        console.log(`Marking ${id} ("${movie.title}"): ${addedLabels.join(', ')}`)
      }

      if (!dryRun) {
        movie.qualityLabels = Array.from(newLabels)
        movie.qualityMarkedAt = new Date().toISOString()
        movie.qualityMarkedBy = 'auto-detector'
        movie.qualityNotes =
          (movie.qualityNotes ? movie.qualityNotes + '; ' : '') +
          `Auto-detected issues: ${addedLabels.join(', ')}`
      }

      markedCount++
      totalIssues += addedLabels.length
    }
  }

  console.log(`\nDetection complete.`)
  console.log(`Movies checked: ${entries.length}`)
  console.log(`Movies with new issues: ${markedCount}`)
  console.log(`Total new labels: ${totalIssues}`)

  if (!dryRun && markedCount > 0) {
    console.log('Saving database...')
    await saveMoviesDatabase(db)
    console.log('Database saved.')
  }
}

detectQualityIssues().catch(err => {
  console.error('Error during quality detection:', err)
  process.exit(1)
})
