import { defineEventHandler, getQuery } from 'h3'
import { loadMoviesDatabase } from '../../../utils/movieData'

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const q = ((query.q as string) || '').toLowerCase().trim()

  // Parse filter parameters
  const minRating = query.minRating ? Number(query.minRating) : 0
  const minYear = query.minYear ? Number(query.minYear) : 0
  const maxYear = query.maxYear ? Number(query.maxYear) : 0
  const minVotes = query.minVotes ? Number(query.minVotes) : 0
  const maxVotes = query.maxVotes ? Number(query.maxVotes) : 0
  const genres = query.genres ? (query.genres as string).split(',').filter(Boolean) : []
  const countries = query.countries ? (query.countries as string).split(',').filter(Boolean) : []
  const sources = query.sources ? (query.sources as string).split(',').filter(Boolean) : []

  const hasFilters =
    minRating > 0 ||
    minYear > 0 ||
    maxYear > 0 ||
    minVotes > 0 ||
    maxVotes > 0 ||
    genres.length > 0 ||
    countries.length > 0 ||
    sources.length > 0

  // Require either search query or filters
  if (!q && !hasFilters) {
    return []
  }

  const db = await loadMoviesDatabase()
  const results: any[] = []

  for (const [key, value] of Object.entries(db)) {
    if (key.startsWith('_')) continue
    const entry = value as MovieEntry

    // Apply search query filter (if provided)
    if (q) {
      const searchFields = [
        entry.title,
        entry.metadata?.Director,
        entry.metadata?.Writer,
        entry.metadata?.Actors,
        entry.metadata?.Plot,
        entry.imdbId,
      ].filter(Boolean) as string[]

      const matches = searchFields.some(field => field.toLowerCase().includes(q))
      if (!matches) continue
    }

    // Apply rating filter
    if (minRating > 0) {
      const rating = parseFloat(entry.metadata?.imdbRating || '0')
      if (rating < minRating) continue
    }

    // Apply year filter
    if (minYear > 0) {
      if (!entry.year || entry.year < minYear) continue
    }
    if (maxYear > 0) {
      if (!entry.year || entry.year > maxYear) continue
    }

    // Apply votes filter
    if (minVotes > 0) {
      const votes = parseInt(String(entry.metadata?.imdbVotes || '0').replace(/,/g, ''))
      if (votes < minVotes) continue
    }
    if (maxVotes > 0) {
      const votes = parseInt(String(entry.metadata?.imdbVotes || '0').replace(/,/g, ''))
      if (votes > maxVotes) continue
    }

    // Apply genre filter
    if (genres.length > 0) {
      const movieGenres = entry.metadata?.Genre?.split(', ').map(g => g.trim()) || []
      const hasGenre = genres.some(selectedGenre => movieGenres.includes(selectedGenre))
      if (!hasGenre) continue
    }

    // Apply country filter
    if (countries.length > 0) {
      const movieCountries = entry.metadata?.Country?.split(', ').map(c => c.trim()) || []
      const hasCountry = countries.some(selectedCountry => movieCountries.includes(selectedCountry))
      if (!hasCountry) continue
    }

    // Apply source filter
    if (sources.length > 0) {
      const hasSources = entry.sources?.some((source: any) => {
        if (source.type === 'archive.org') {
          return sources.includes('archive.org')
        }
        if (source.type === 'youtube') {
          return sources.includes(source.channelName)
        }
        return false
      })
      if (!hasSources) continue
    }

    // Return only necessary fields for the search result list
    results.push({
      imdbId: entry.imdbId,
      title: entry.title,
      year: entry.year,
      metadata: {
        Poster: entry.metadata?.Poster,
        Director: entry.metadata?.Director,
        Writer: entry.metadata?.Writer,
        Plot: entry.metadata?.Plot,
      },
    })
  }

  // Sort by title and limit to 300 results
  return results.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 300)
})
