/**
 * Script to consolidate JESUS Film language variants
 *
 * Finds all movies with archive- IDs matching "JESUS Film .* Language" pattern
 * and moves their sources into the main movie (tt0079368)
 */

import * as fs from 'fs'
import * as path from 'path'

interface Source {
  type: string
  quality?: string
  url: string
  title?: string
  language?: string
  size?: number
  lastModified?: string
  via?: string
}

interface Movie {
  movieId: string
  title: string
  sources: Source[]
  lastUpdated: string
  ai?: {
    // AI-specific fields
    [key: string]: unknown
  }
}

interface MoviesData {
  [key: string]: Movie
}

const MOVIES_FILE = path.join(process.cwd(), 'data', 'movies.json')
const TARGET_MOVIE_ID = 'tt0079368'

function main() {
  console.log('Loading movies data...')
  const moviesData: MoviesData = JSON.parse(fs.readFileSync(MOVIES_FILE, 'utf-8'))

  console.log(`Total movies in database: ${Object.keys(moviesData).length}`)

  // Find all JESUS Film archive entries
  const jesusFilmEntries: [string, Movie][] = []
  const jesusFilmPattern = /^archive-jesus-film-.+$/
  const titlePattern = /^JESUS Film /i

  for (const [movieId, movie] of Object.entries(moviesData)) {
    if (jesusFilmPattern.test(movieId) && titlePattern.test(movie.title)) {
      jesusFilmEntries.push([movieId, movie])
    }
  }

  console.log(`Found ${jesusFilmEntries.length} JESUS Film language variants`)

  if (jesusFilmEntries.length === 0) {
    console.log('No JESUS Film entries to consolidate. Exiting.')
    return
  }

  // Get the target movie or create it
  const targetMovie = moviesData[TARGET_MOVIE_ID]
  if (!targetMovie) {
    console.error(`Target movie ${TARGET_MOVIE_ID} not found!`)
    process.exit(1)
  }

  console.log(`Target movie: "${targetMovie.title}"`)
  console.log(`Target currently has ${targetMovie.sources?.length || 0} sources`)

  // Collect all sources from JESUS Film entries
  const sourcesToAdd: Source[] = []
  let duplicateCount = 0

  for (const [, movie] of jesusFilmEntries) {
    if (movie.sources && movie.sources.length > 0) {
      for (const source of movie.sources) {
        // Check if source already exists in target
        const exists = targetMovie.sources?.some(existing => existing.url === source.url)

        if (exists) {
          duplicateCount++
        } else {
          // Add language info from the title if not present
          if (!source.language) {
            // Extract language from title: "JESUS Film <Language>" or "JESUS Film <Language> Language"
            const match = movie.title.match(/^JESUS Film (.+?)(?: Language)?$/i)
            if (match) {
              source.language = match[1]
            }
          }
          sourcesToAdd.push(source)
        }
      }
    }
  }

  console.log(`\nSources to add: ${sourcesToAdd.length}`)
  console.log(`Duplicate sources skipped: ${duplicateCount}`)

  // Add sources to target movie
  if (!targetMovie.sources) {
    targetMovie.sources = []
  }

  targetMovie.sources.push(...sourcesToAdd)
  targetMovie.lastUpdated = new Date().toISOString()

  console.log(`Target movie now has ${targetMovie.sources.length} sources`)

  // Remove the archive JESUS Film entries
  for (const [movieId] of jesusFilmEntries) {
    delete moviesData[movieId]
  }

  console.log(`\nRemoved ${jesusFilmEntries.length} archive entries`)
  console.log(`Total movies in database: ${Object.keys(moviesData).length}`)

  // Write back to file
  fs.writeFileSync(MOVIES_FILE, JSON.stringify(moviesData, null, 2))

  console.log('\nDone! Movies data saved.')

  // Summary
  console.log('\n--- Summary ---')
  console.log(`Consolidated ${jesusFilmEntries.length} JESUS Film language variants`)
  console.log(`Added ${sourcesToAdd.length} sources to ${TARGET_MOVIE_ID}`)
  console.log(`Skipped ${duplicateCount} duplicate sources`)
}

main()
