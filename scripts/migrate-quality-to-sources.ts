/**
 * Migrate quality labels from movie level to source level
 *
 * This script:
 * 1. Finds all movies with qualityLabels
 * 2. Converts movie-level qualityLabels to source-level qualityMarks
 * 3. Removes movie-level quality fields (qualityLabels, qualityMarkedAt, qualityMarkedBy, qualityNotes)
 * 4. Applies the quality marks to all sources of that movie
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { MoviesDatabase, MovieEntry } from '../shared/types/movie'

const MOVIES_DB_PATH = join(process.cwd(), 'data/movies.json')

// Map movie-level quality labels to source-level quality marks
const qualityLabelToMarkMap: Record<string, string[]> = {
  clip: ['incomplete'],
  teaser: ['incomplete'],
  trailer: ['incomplete'],
  promo: ['incomplete'],
  'behind-the-scenes': ['incomplete'],
  interview: ['incomplete'],
  duplicate: ['low-quality'],
  incorrect: ['low-quality'],
  incomplete: ['incomplete'],
  adult: ['low-quality'],
  blocked: ['video-issues'],
}

async function migrateQualityToSources() {
  console.log('Reading movies database...')
  const dbContent = await readFile(MOVIES_DB_PATH, 'utf-8')
  const db: MoviesDatabase = JSON.parse(dbContent)

  let migratedCount = 0
  let totalMovies = 0

  for (const [movieId, entry] of Object.entries(db)) {
    // Skip schema and example entries
    if (movieId.startsWith('_')) continue

    totalMovies++
    const movie = entry as MovieEntry

    // Check if movie has quality labels
    if (movie.qualityLabels && movie.qualityLabels.length > 0) {
      console.log(`\nMigrating ${movieId}: ${movie.title}`)
      console.log(`  Quality labels: ${movie.qualityLabels.join(', ')}`)

      // Convert quality labels to quality marks
      const qualityMarks = new Set<string>()
      for (const label of movie.qualityLabels) {
        const marks = qualityLabelToMarkMap[label] || ['low-quality']
        marks.forEach(mark => qualityMarks.add(mark))
      }

      const marksArray = Array.from(qualityMarks)
      console.log(`  Converted to marks: ${marksArray.join(', ')}`)

      // Apply quality marks to all sources
      if (movie.sources && movie.sources.length > 0) {
        for (const source of movie.sources) {
          source.qualityMarks = marksArray
          console.log(`    Applied to source: ${source.id}`)
        }
      }

      // Remove movie-level quality fields
      delete movie.qualityLabels
      delete movie.qualityMarkedAt
      delete movie.qualityMarkedBy
      delete movie.qualityNotes

      movie.lastUpdated = new Date().toISOString()
      migratedCount++
    }
  }

  console.log(`\n\nMigration Summary:`)
  console.log(`  Total movies: ${totalMovies}`)
  console.log(`  Movies migrated: ${migratedCount}`)

  // Write back to database
  console.log('\nWriting updated database...')
  await writeFile(MOVIES_DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
  console.log('✓ Migration complete!')
}

migrateQualityToSources().catch(console.error)
