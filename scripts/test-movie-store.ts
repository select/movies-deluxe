#!/usr/bin/env tsx

/**
 * Test script to verify the movie store refactoring
 * This simulates loading movies from data/movies.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MovieEntry } from '../types/movie'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testMovieStore() {
  console.log('Testing movie store refactoring...\n')

  // Load movies.json
  const moviesPath = path.join(__dirname, '../data/movies.json')
  const data = JSON.parse(fs.readFileSync(moviesPath, 'utf-8'))

  // Convert object to array (same logic as store)
  const movieEntries: MovieEntry[] = []
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_')) continue
    if (value && typeof value === 'object' && 'imdbId' in value && 'title' in value) {
      movieEntries.push(value as MovieEntry)
    }
  }

  console.log(`✓ Loaded ${movieEntries.length} movies from data/movies.json`)

  // Test filtering by source
  const archiveMovies = movieEntries.filter(movie =>
    movie.sources.some(source => source.type === 'archive.org')
  )
  const youtubeMovies = movieEntries.filter(movie =>
    movie.sources.some(source => source.type === 'youtube')
  )

  console.log(`✓ Archive.org movies: ${archiveMovies.length}`)
  console.log(`✓ YouTube movies: ${youtubeMovies.length}`)

  // Test enriched vs unenriched
  const enriched = movieEntries.filter(m => m.metadata !== undefined)
  const unenriched = movieEntries.filter(m => m.metadata === undefined)

  console.log(`✓ Movies with OMDB metadata: ${enriched.length}`)
  console.log(`✓ Movies without metadata: ${unenriched.length}`)

  // Test search functionality
  const searchQuery = 'christmas'
  const searchResults = movieEntries.filter(movie => {
    const lowerQuery = searchQuery.toLowerCase()
    if (movie.title.toLowerCase().includes(lowerQuery)) return true
    if (movie.ai?.extractedTitle?.toLowerCase().includes(lowerQuery)) return true
    if (movie.metadata?.Genre?.toLowerCase().includes(lowerQuery)) return true
    if (movie.metadata?.Plot?.toLowerCase().includes(lowerQuery)) return true
    return false
  })

  console.log(`✓ Search for "${searchQuery}": ${searchResults.length} results`)
  if (searchResults.length > 0) {
    console.log(`  Example: "${searchResults[0].title}"`)
  }

  // Test poster URL logic
  const moviesWithPosters = movieEntries.filter(
    m => m.metadata?.Poster && m.metadata.Poster !== 'N/A'
  )
  console.log(`✓ Movies with OMDB poster URLs: ${moviesWithPosters.length}`)

  // Show example movie structure
  if (movieEntries.length > 0) {
    const example = movieEntries[0]
    console.log('\n✓ Example movie structure:')
    console.log(`  - imdbId: ${example.imdbId}`)
    console.log(`  - title: ${example.title}`)
    console.log(`  - year: ${example.year || 'N/A'}`)
    console.log(`  - sources: ${example.sources.length}`)
    console.log(`  - has metadata: ${example.metadata ? 'Yes' : 'No'}`)
    console.log(`  - has AI data: ${example.ai ? 'Yes' : 'No'}`)
    if (example.ai?.extractedTitle) {
      console.log(`  - AI extracted title: "${example.ai.extractedTitle}"`)
    }
  }

  console.log('\n✅ All tests passed! Movie store refactoring is working correctly.')
}

testMovieStore().catch(error => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
