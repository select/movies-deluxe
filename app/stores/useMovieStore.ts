import type { MovieEntry, MovieSource } from '~/types'
import { useDatabase } from '~/composables/useDatabase'

export interface LoadingState {
  movies: boolean
  movieDetails: boolean
  imdbFetch: boolean
}

export const useMovieStore = defineStore('movie', () => {
  const { query, init: initDb } = useDatabase()

  // State
  const movies = ref<MovieEntry[]>([]) // This will now hold the currently visible/loaded movies
  const totalCount = ref(0)
  const isLoading = ref<LoadingState>({
    movies: false,
    movieDetails: false,
    imdbFetch: false,
  })
  const isInitialLoading = ref(true)

  // Cached poster existence checks
  const posterCache = ref<Map<string, boolean>>(new Map())

  /**
   * Initialize the database
   */
  const init = async () => {
    await initDb()
    isInitialLoading.value = false
  }

  /**
   * Fetch movies with filters, sorting, and pagination
   */
  const fetchMovies = async (options: {
    offset: number
    limit: number
    filters: any
    sort: { field: string; direction: string }
  }) => {
    isLoading.value.movies = true

    try {
      const { offset, limit, filters, sort } = options

      // Build WHERE clause
      const whereClauses: string[] = []
      const params: any[] = []

      if (filters.searchQuery) {
        whereClauses.push('imdbId IN (SELECT imdbId FROM fts_movies WHERE fts_movies MATCH ?)')
        params.push(filters.searchQuery)
      }

      if (filters.minRating > 0) {
        whereClauses.push('imdbRating >= ?')
        params.push(filters.minRating)
      }

      if (filters.minYear > 0) {
        whereClauses.push('year >= ?')
        params.push(filters.minYear)
      }

      if (filters.minVotes > 0) {
        whereClauses.push('imdbVotes >= ?')
        params.push(filters.minVotes)
      }

      if (filters.sources.length > 0) {
        const sourcePlaceholders = filters.sources.map(() => '?').join(',')
        whereClauses.push(
          `imdbId IN (SELECT movieId FROM sources WHERE type IN (${sourcePlaceholders}) OR youtube_channelName IN (${sourcePlaceholders}))`
        )
        params.push(...filters.sources, ...filters.sources)
      }

      if (filters.genres.length > 0) {
        filters.genres.forEach((genre: string) => {
          whereClauses.push('genre LIKE ?')
          params.push(`%${genre}%`)
        })
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

      // Get total count
      const countResult = await query<{ count: number }>(
        `SELECT COUNT(*) as count FROM movies ${whereSql}`,
        params
      )
      totalCount.value = countResult[0]?.count || 0

      // Build ORDER BY
      let orderBy = ''
      if (filters.searchQuery && sort.field === 'relevance') {
        // FTS5 relevance is handled by the MATCH but we can use rank
        orderBy = 'ORDER BY rank'
      } else {
        const direction = sort.direction.toUpperCase()
        switch (sort.field) {
          case 'year':
            orderBy = `ORDER BY year ${direction}, title ASC`
            break
          case 'rating':
            orderBy = `ORDER BY imdbRating ${direction}, imdbVotes ${direction}`
            break
          case 'votes':
            orderBy = `ORDER BY imdbVotes ${direction}`
            break
          case 'title':
            orderBy = `ORDER BY title ${direction}`
            break
          default:
            orderBy = 'ORDER BY year DESC, title ASC'
        }
      }

      // Fetch page
      const sql = `
        SELECT * FROM movies 
        ${whereSql} 
        ${orderBy} 
        LIMIT ? OFFSET ?
      `
      const movieRows = await query<any>(sql, [...params, limit, offset])

      // Map rows to MovieEntry
      // Note: We need to fetch sources for these movies too
      const movieIds = movieRows.map((r: any) => r.imdbId)
      const sourcesMap: Record<string, MovieSource[]> = {}

      if (movieIds.length > 0) {
        const sourcePlaceholders = movieIds.map(() => '?').join(',')
        const sourceRows = await query<any>(
          `SELECT * FROM sources WHERE movieId IN (${sourcePlaceholders})`,
          movieIds
        )

        sourceRows.forEach((s: any) => {
          if (!sourcesMap[s.movieId]) sourcesMap[s.movieId] = []
          sourcesMap[s.movieId].push({
            type: s.type,
            url: s.url,
            label: s.label,
            quality: s.quality,
            addedAt: s.addedAt,
            description: s.description,
            id: s.type === 'archive.org' ? s.archive_identifier : s.youtube_videoId,
            channelName: s.youtube_channelName,
            channelId: s.youtube_channelId,
            language: s.youtube_language,
          } as any)
        })
      }

      const movieEntries: MovieEntry[] = movieRows.map((r: any) => ({
        imdbId: r.imdbId,
        title: r.title,
        year: r.year,
        verified: !!r.verified,
        lastUpdated: r.lastUpdated,
        sources: sourcesMap[r.imdbId] || [],
        metadata: {
          Title: r.title,
          Year: r.year?.toString(),
          Rated: r.rated,
          Runtime: r.runtime,
          Genre: r.genre,
          Director: r.director,
          Writer: r.writer,
          Actors: r.actors,
          Plot: r.plot,
          Language: r.language,
          Country: r.country,
          Awards: r.awards,
          Poster: r.poster,
          imdbRating: r.imdbRating?.toString(),
          imdbVotes: r.imdbVotes?.toLocaleString(),
          imdbID: r.imdbId,
        },
      }))

      movies.value = movieEntries
      return movieEntries
    } catch {
      return []
    } finally {
      isLoading.value.movies = false
    }
  }

  /**
   * Get a single movie by imdbId
   */
  const getMovieById = async (imdbId: string): Promise<MovieEntry | undefined> => {
    const rows = await query<any>('SELECT * FROM movies WHERE imdbId = ?', [imdbId])
    if (rows.length === 0) return undefined

    const r = rows[0]
    const sourceRows = await query<any>('SELECT * FROM sources WHERE movieId = ?', [imdbId])
    const sources = sourceRows.map(
      (s: any) =>
        ({
          type: s.type,
          url: s.url,
          label: s.label,
          quality: s.quality,
          addedAt: s.addedAt,
          description: s.description,
          id: s.type === 'archive.org' ? s.archive_identifier : s.youtube_videoId,
          channelName: s.youtube_channelName,
          channelId: s.youtube_channelId,
          language: s.youtube_language,
        }) as any
    )

    return {
      imdbId: r.imdbId,
      title: r.title,
      year: r.year,
      verified: !!r.verified,
      lastUpdated: r.lastUpdated,
      sources,
      metadata: {
        Title: r.title,
        Year: r.year?.toString(),
        Rated: r.rated,
        Runtime: r.runtime,
        Genre: r.genre,
        Director: r.director,
        Writer: r.writer,
        Actors: r.actors,
        Plot: r.plot,
        Language: r.language,
        Country: r.country,
        Awards: r.awards,
        Poster: r.poster,
        imdbRating: r.imdbRating?.toString(),
        imdbVotes: r.imdbVotes?.toLocaleString(),
        imdbID: r.imdbId,
      },
    }
  }

  // Poster utilities (keep existing ones but adapt if needed)
  const posterExists = async (imdbId: string): Promise<boolean> => {
    if (!imdbId) return false
    if (posterCache.value.has(imdbId)) return posterCache.value.get(imdbId)!
    try {
      const response = await fetch(`/posters/${imdbId}.jpg`, { method: 'HEAD' })
      const exists = response.ok
      posterCache.value.set(imdbId, exists)
      return exists
    } catch {
      posterCache.value.set(imdbId, false)
      return false
    }
  }

  const getPosterUrl = async (movie: MovieEntry): Promise<string> => {
    const placeholder = '/images/poster-placeholder.jpg'
    if (!movie.imdbId) return placeholder
    const hasLocal = await posterExists(movie.imdbId)
    if (hasLocal) return `/posters/${movie.imdbId}.jpg`
    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') return omdbPoster
    return placeholder
  }

  const getPosterUrlSync = (movie: MovieEntry, preferLocal: boolean = true): string => {
    const placeholder = '/images/poster-placeholder.jpg'
    if (!movie.imdbId) return placeholder
    if (preferLocal) return `/posters/${movie.imdbId}.jpg`
    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') return omdbPoster
    return placeholder
  }

  return {
    movies,
    totalCount,
    isLoading,
    isInitialLoading,
    init,
    fetchMovies,
    getMovieById,
    getPosterUrl,
    getPosterUrlSync,
  }
})
