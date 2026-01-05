import { querySqlite } from './sqlite'
import type { SavedQueryFilterState } from '../../shared/types/collections'

/**
 * Execute a saved query against the movie database and return matching IMDB IDs
 */
export async function executeSavedQuery(
  searchQuery: string,
  filterState: SavedQueryFilterState
): Promise<string[]> {
  const params: unknown[] = []
  const where: string[] = []

  // 1. Search Query (FTS5)
  if (searchQuery?.trim()) {
    where.push('m.imdbId IN (SELECT imdbId FROM fts_movies WHERE fts_movies MATCH ?)')
    const sanitizedQuery = searchQuery.replace(/"/g, '""').trim()
    params.push(`"${sanitizedQuery}"`)
  }

  // 2. Basic Filters (only apply if set)
  if (filterState.minRating && filterState.minRating > 0) {
    where.push('m.imdbRating >= ?')
    params.push(filterState.minRating)
  }
  if (filterState.minYear && filterState.minYear > 0) {
    where.push('m.year >= ?')
    params.push(filterState.minYear)
  }
  if (filterState.maxYear && filterState.maxYear > 0) {
    where.push('m.year <= ?')
    params.push(filterState.maxYear)
  }
  if (filterState.minVotes && filterState.minVotes > 0) {
    where.push('m.imdbVotes >= ?')
    params.push(filterState.minVotes)
  }
  if (filterState.maxVotes && filterState.maxVotes > 0) {
    where.push('m.imdbVotes <= ?')
    params.push(filterState.maxVotes)
  }

  // 3. Genre Filters
  if (filterState.genres && filterState.genres.length > 0) {
    filterState.genres.forEach(genre => {
      where.push('m.genre LIKE ?')
      params.push(`%${genre}%`)
    })
  }

  // 4. Country Filters
  if (filterState.countries && filterState.countries.length > 0) {
    filterState.countries.forEach(country => {
      where.push('m.country LIKE ?')
      params.push(`%${country}%`)
    })
  }

  // 5. Source Filters
  if (filterState.sources && filterState.sources.length > 0) {
    const sourceConditions: string[] = []

    if (filterState.sources.includes('archive.org')) {
      sourceConditions.push(
        "EXISTS (SELECT 1 FROM sources s WHERE s.imdbId = m.imdbId AND s.type = 'archive.org')"
      )
    }

    const youtubeChannels = filterState.sources.filter(s => s !== 'archive.org')
    if (youtubeChannels.length > 0) {
      const placeholders = youtubeChannels.map(() => '?').join(',')
      sourceConditions.push(`EXISTS (
        SELECT 1 FROM sources s 
        JOIN channels c ON s.channelId = c.id 
        WHERE s.imdbId = m.imdbId AND s.type = 'youtube' AND c.name IN (${placeholders})
      )`)
      params.push(...youtubeChannels)
    }

    if (sourceConditions.length > 0) {
      where.push(`(${sourceConditions.join(' OR ')})`)
    }
  }

  // Build final query
  let sql = 'SELECT m.imdbId FROM movies m'
  if (where.length > 0) {
    sql += ' WHERE ' + where.join(' AND ')
  }

  // Sorting (use default if not specified)
  const sortField = filterState.sort?.field || 'year'
  const sortDir = (filterState.sort?.direction || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  if (sortField === 'rating') {
    sql += ` ORDER BY m.imdbRating ${sortDir}`
  } else if (sortField === 'year') {
    sql += ` ORDER BY m.year ${sortDir}`
  } else if (sortField === 'title') {
    sql += ` ORDER BY m.title ${sortDir}`
  } else if (sortField === 'votes') {
    sql += ` ORDER BY m.imdbVotes ${sortDir}`
  } else {
    sql += ` ORDER BY m.year DESC` // Default
  }

  try {
    const results = querySqlite<{ imdbId: string }>(sql, params)
    return results.map(r => r.imdbId)
  } catch (error) {
    console.error('Failed to execute saved query:', error)
    console.error('SQL:', sql)
    console.error('Params:', params)
    throw error
  }
}
