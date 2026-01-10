import { loadMoviesDatabase, saveMoviesDatabase } from '../server/utils/movieData'
import { QualityLabel, type MovieEntry } from '../shared/types/movie'

/**
 * Extended MovieEntry type with quality tracking fields
 */
interface MovieEntryWithQuality extends MovieEntry {
  qualityLabels?: QualityLabel[]
  qualityMarkedAt?: string
  qualityMarkedBy?: string
  qualityNotes?: string
}

/**
 * Mark movies as 'clip' based on file size and genre criteria
 *
 * Criteria:
 * 1. Have a tt (IMDb) ID
 * 2. Do NOT have the 'short' genre
 * 3. Have a file size below 100MB
 */
async function markClips() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose')

  console.log(`Loading database...${dryRun ? ' (DRY RUN)' : ''}`)
  const db = await loadMoviesDatabase()
  const entries = Object.entries(db).filter(([key]) => key.startsWith('tt'))

  let markedCount = 0
  const SIZE_THRESHOLD = 100 * 1024 * 1024 // 100MB in bytes

  for (const [id, entry] of entries) {
    const movie = entry as MovieEntryWithQuality

    // Check if movie has 'short' genre
    const hasShortGenre = movie.metadata?.Genre?.toLowerCase().includes('short') ?? false

    // Skip if it has 'short' genre
    if (hasShortGenre) {
      continue
    }

    // Check if any source has file size below threshold
    let hasSmallFile = false
    for (const source of movie.sources) {
      const fileSize = source.size || source.fileSize
      if (fileSize && fileSize < SIZE_THRESHOLD) {
        hasSmallFile = true
        break
      }
    }

    // Skip if no small files found
    if (!hasSmallFile) {
      continue
    }

    // Initialize qualityLabels if not present
    const qualityLabels = movie.qualityLabels || []

    // Skip if already marked as clip
    if (qualityLabels.includes(QualityLabel.CLIP)) {
      continue
    }

    if (verbose) {
      const smallestSize = Math.min(
        ...movie.sources.map(s => s.size || s.fileSize || Infinity).filter(s => s !== Infinity)
      )
      const sizeMB = (smallestSize / (1024 * 1024)).toFixed(2)
      console.log(`Marking ${id} ("${movie.title}") as clip - smallest file: ${sizeMB}MB`)
    }

    if (!dryRun) {
      // Add clip label
      movie.qualityLabels = [...qualityLabels, QualityLabel.CLIP]
      movie.qualityMarkedAt = new Date().toISOString()
      movie.qualityMarkedBy = 'clip-detector'
      const existingNotes = movie.qualityNotes || ''
      movie.qualityNotes =
        (existingNotes ? existingNotes + '; ' : '') + 'Auto-detected: file size below 100MB'
    }

    markedCount++
  }

  console.log(`\nDetection complete.`)
  console.log(`Movies checked: ${entries.length}`)
  console.log(`Movies marked as clips: ${markedCount}`)

  if (!dryRun && markedCount > 0) {
    console.log('Saving database...')
    await saveMoviesDatabase(db)
    console.log('Database saved.')
  }
}

markClips().catch(err => {
  console.error('Error during clip detection:', err)
  process.exit(1)
})
