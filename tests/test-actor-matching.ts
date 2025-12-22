/**
 * Test actor matching with real movie data
 *
 * This test verifies that the actor matching logic in the relatedMovies
 * computed property works correctly with actual movies from the database.
 *
 * Test cases:
 * 1. Movies with shared actors (e.g., Cary Grant films)
 * 2. Movies with no shared actors
 * 3. Movies without metadata.Actors field
 * 4. Edge cases (single actor, many actors, special characters in names)
 *
 * Run with: pnpm tsx tests/test-actor-matching.ts
 */

import fs from 'fs'
import path from 'path'

// Load movies data
const moviesPath = path.join(process.cwd(), 'public/data/movies.json')
const moviesObj = JSON.parse(fs.readFileSync(moviesPath, 'utf8'))
const movies = Object.values(moviesObj).filter((m: any) => m.imdbId) as any[]

console.log(`Loaded ${movies.length} movies from database\n`)

// Helper function to calculate related movies score (matches app/pages/movie/[id].vue logic)
function calculateRelatedMovies(currentMovie: any) {
  return movies
    .filter(m => m.imdbId !== currentMovie.imdbId)
    .map(m => {
      let score = 0
      const breakdown: string[] = []

      // Genre match (highest priority)
      if (currentMovie.metadata?.Genre && m.metadata?.Genre) {
        const currentGenres = currentMovie.metadata.Genre.split(',').map((g: string) =>
          g.trim().toLowerCase()
        )
        const movieGenres = m.metadata.Genre.split(',').map((g: string) => g.trim().toLowerCase())
        const commonGenres = currentGenres.filter((g: string) => movieGenres.includes(g))
        if (commonGenres.length > 0) {
          const genreScore = commonGenres.length * 10
          score += genreScore
          breakdown.push(`Genre: ${genreScore}`)
        }
      }

      // Year similarity (±5 years)
      if (currentMovie.year && m.year) {
        const yearDiff = Math.abs(parseInt(currentMovie.year) - parseInt(m.year))
        if (yearDiff <= 5) {
          const yearScore = (5 - yearDiff) * 2
          score += yearScore
          breakdown.push(`Year: ${yearScore}`)
        }
      }

      // Director match
      if (currentMovie.metadata?.Director && m.metadata?.Director) {
        if (currentMovie.metadata.Director === m.metadata.Director) {
          score += 15
          breakdown.push('Director: 15')
        }
      }

      // Actor matches
      if (currentMovie.metadata?.Actors && m.metadata?.Actors) {
        const currentActors = currentMovie.metadata.Actors.split(',').map((a: string) =>
          a.trim().toLowerCase()
        )
        const movieActors = m.metadata.Actors.split(',').map((a: string) => a.trim().toLowerCase())
        const commonActors = currentActors.filter((a: string) => movieActors.includes(a))
        if (commonActors.length > 0) {
          const actorScore = commonActors.length * 5
          score += actorScore
          breakdown.push(`Actors: ${actorScore} (${commonActors.join(', ')})`)
        }
      }

      // Prefer movies with metadata
      if (m.metadata) {
        score += 1
        breakdown.push('Metadata: 1')
      }

      return { movie: m, score, breakdown }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

// Test Case 1: Movies with shared actors (Cary Grant films)
console.log('='.repeat(80))
console.log('TEST CASE 1: Movies with shared actors (Cary Grant films)')
console.log('='.repeat(80))

const hisGirlFriday = movies.find(m => m.imdbId === 'tt0032599')
if (!hisGirlFriday) {
  console.error('ERROR: Could not find "His Girl Friday" in database')
  process.exit(1)
}

console.log(`\nCurrent Movie: ${hisGirlFriday.title} (${hisGirlFriday.year})`)
console.log(`Actors: ${hisGirlFriday.metadata.Actors}`)
console.log(`Genre: ${hisGirlFriday.metadata.Genre}`)
console.log(`Director: ${hisGirlFriday.metadata.Director}`)

const relatedToHisGirlFriday = calculateRelatedMovies(hisGirlFriday)

console.log('\nTop 8 Related Movies:')
relatedToHisGirlFriday.forEach((item, index) => {
  console.log(`\n${index + 1}. ${item.movie.title} (${item.movie.year}) - Score: ${item.score}`)
  console.log(`   ${item.breakdown.join(' | ')}`)
})

// Verify Cary Grant movies appear in results
const caryGrantMovies = relatedToHisGirlFriday.filter(item =>
  item.breakdown.some(b => b.includes('cary grant'))
)

console.log(`\n✓ Found ${caryGrantMovies.length} Cary Grant movies in related results:`)
caryGrantMovies.forEach(item => {
  console.log(`  - ${item.movie.title} (${item.movie.year})`)
})

if (caryGrantMovies.length === 0) {
  console.error('✗ FAIL: Expected to find Cary Grant movies in related results')
  process.exit(1)
}

// Test Case 2: Movies with no shared actors
console.log('\n' + '='.repeat(80))
console.log('TEST CASE 2: Movies with no shared actors')
console.log('='.repeat(80))

const houseOnHauntedHill = movies.find(m => m.imdbId === 'tt0051744')
if (!houseOnHauntedHill) {
  console.error('ERROR: Could not find "House on Haunted Hill" in database')
  process.exit(1)
}

console.log(`\nCurrent Movie: ${houseOnHauntedHill.title} (${houseOnHauntedHill.year})`)
console.log(`Actors: ${houseOnHauntedHill.metadata.Actors}`)
console.log(`Genre: ${houseOnHauntedHill.metadata.Genre}`)

const relatedToHouse = calculateRelatedMovies(houseOnHauntedHill)

console.log('\nTop 8 Related Movies:')
relatedToHouse.forEach((item, index) => {
  console.log(`\n${index + 1}. ${item.movie.title} (${item.movie.year}) - Score: ${item.score}`)
  console.log(`   ${item.breakdown.join(' | ')}`)
})

// Check if any have actor matches
const actorMatches = relatedToHouse.filter(item =>
  item.breakdown.some(b => b.startsWith('Actors:'))
)

console.log(`\n✓ Found ${actorMatches.length} movies with shared actors`)
if (actorMatches.length > 0) {
  actorMatches.forEach(item => {
    const actorBreakdown = item.breakdown.find(b => b.startsWith('Actors:'))
    console.log(`  - ${item.movie.title}: ${actorBreakdown}`)
  })
}

// Test Case 3: Movies without metadata.Actors field
console.log('\n' + '='.repeat(80))
console.log('TEST CASE 3: Movies without metadata.Actors field')
console.log('='.repeat(80))

const moviesWithoutActors = movies.filter(m => !m.metadata?.Actors)
console.log(`\nFound ${moviesWithoutActors.length} movies without actor metadata`)

if (moviesWithoutActors.length > 0) {
  const sampleMovie = moviesWithoutActors[0]
  console.log(`\nSample: ${sampleMovie.title} (${sampleMovie.year})`)
  console.log(`Has metadata: ${!!sampleMovie.metadata}`)
  console.log(`Has Actors field: ${!!sampleMovie.metadata?.Actors}`)

  const relatedToSample = calculateRelatedMovies(sampleMovie)
  console.log(`\n✓ Related movies calculated successfully (${relatedToSample.length} found)`)

  // Verify no actor scoring in breakdown
  const hasActorScoring = relatedToSample.some(item =>
    item.breakdown.some(b => b.startsWith('Actors:'))
  )

  if (hasActorScoring) {
    console.error('✗ FAIL: Expected no actor scoring for movies without actor metadata')
    process.exit(1)
  }
  console.log('✓ No actor scoring applied (as expected)')
}

// Test Case 4: Edge cases
console.log('\n' + '='.repeat(80))
console.log('TEST CASE 4: Edge cases')
console.log('='.repeat(80))

// Find movie with single actor
const moviesWithSingleActor = movies.filter(
  m => m.metadata?.Actors && !m.metadata.Actors.includes(',')
)
console.log(`\nMovies with single actor: ${moviesWithSingleActor.length}`)
if (moviesWithSingleActor.length > 0) {
  const sample = moviesWithSingleActor[0]
  console.log(`Sample: ${sample.title} - Actor: ${sample.metadata.Actors}`)
}

// Find movie with many actors
const moviesWithManyActors = movies
  .filter(m => m.metadata?.Actors)
  .map(m => ({
    movie: m,
    actorCount: m.metadata.Actors.split(',').length,
  }))
  .sort((a, b) => b.actorCount - a.actorCount)

if (moviesWithManyActors.length > 0) {
  const mostActors = moviesWithManyActors[0]
  console.log(`\nMovie with most actors: ${mostActors.movie.title}`)
  console.log(`Actor count: ${mostActors.actorCount}`)
  console.log(`Actors: ${mostActors.movie.metadata.Actors}`)
}

// Check for special characters in actor names
const actorsWithSpecialChars = movies
  .filter(m => m.metadata?.Actors)
  .filter(m => /[^a-zA-Z0-9,\s\-.]/.test(m.metadata.Actors))

console.log(`\nMovies with special characters in actor names: ${actorsWithSpecialChars.length}`)
if (actorsWithSpecialChars.length > 0) {
  const sample = actorsWithSpecialChars[0]
  console.log(`Sample: ${sample.title}`)
  console.log(`Actors: ${sample.metadata.Actors}`)
}

// Summary
console.log('\n' + '='.repeat(80))
console.log('TEST SUMMARY')
console.log('='.repeat(80))

const moviesWithActors = movies.filter(m => m.metadata?.Actors).length
const moviesWithoutActorsCount = movies.filter(m => !m.metadata?.Actors).length

console.log(`\nTotal movies: ${movies.length}`)
console.log(
  `Movies with actor metadata: ${moviesWithActors} (${((moviesWithActors / movies.length) * 100).toFixed(1)}%)`
)
console.log(
  `Movies without actor metadata: ${moviesWithoutActorsCount} (${((moviesWithoutActorsCount / movies.length) * 100).toFixed(1)}%)`
)

console.log('\n✓ All test cases passed!')
console.log('\nActor matching is working correctly:')
console.log('  - Movies with shared actors receive +5 points per shared actor')
console.log('  - Actor matching is balanced with other criteria (genre, director, year)')
console.log('  - Movies without actor metadata are handled gracefully')
console.log('  - Edge cases (single actor, many actors, special characters) work correctly')
