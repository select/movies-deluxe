import Fuse from 'fuse.js'
import type { MovieEntry, MovieSource, MovieSourceType, MovieMetadata } from '~/types'

// Frontend-specific loading state type
export interface LoadingState {
  movies: boolean
  movieDetails: boolean
  imdbFetch: boolean
}

export const useMovieStore = defineStore('movie', () => {
  // State
  const movies = ref<MovieEntry[]>([])
  const isLoading = ref<LoadingState>({
    movies: false,
    movieDetails: false,
    imdbFetch: false,
  })
  const isInitialLoading = ref(true)

  // Fuse.js instance for advanced search
  const fuse = ref<Fuse<MovieEntry> | null>(null)

  // Initialize or update Fuse instance when movies change
  watch(
    movies,
    newMovies => {
      if (newMovies.length > 0) {
        fuse.value = new Fuse(newMovies, {
          keys: [
            { name: 'title', weight: 1.0 }, // Fuse.js can handle both string and string[] automatically
            { name: 'sources.title', weight: 0.9 }, // Original titles from sources
            { name: 'metadata.Actors', weight: 0.7 },
            { name: 'metadata.Director', weight: 0.7 },
            { name: 'metadata.Genre', weight: 0.5 },
            { name: 'year', weight: 0.3 },
          ],
          threshold: 0.3, // Adjust for fuzziness (0.0 is exact match, 1.0 is anything)
          includeScore: true,
          useExtendedSearch: true,
        })
      } else {
        fuse.value = null
      }
    },
    { immediate: true }
  )

  // Cached poster existence checks
  const posterCache = ref<Map<string, boolean>>(new Map())

  /**
   * Load movies from server API
   * Converts the object-based database to an array for easier use in components
   */
  const loadFromFile = async () => {
    isLoading.value.movies = true

    try {
      // Fetch the movies from the server API instead of static file to avoid caching issues
      const response = await $fetch<Record<string, unknown>>('/api/movies')

      if (response.error) {
        console.error('Failed to load movies:', response.message)
        return
      }

      // Convert object to array, filtering out metadata entries
      const movieEntries: MovieEntry[] = Object.entries(response)
        .filter(([key]) => !key.startsWith('_'))
        .filter(([, value]) => {
          if (!value || typeof value !== 'object' || !('imdbId' in value) || !('title' in value)) {
            return false
          }

          const movie = value as any

          // Validate imdbId is string
          if (typeof movie.imdbId !== 'string') return false

          // Validate title is string or array of strings
          if (typeof movie.title === 'string') return true
          if (Array.isArray(movie.title)) {
            return movie.title.every(t => typeof t === 'string')
          }

          return false
        })
        .map(([, value]) => value as MovieEntry)
        .sort((a, b) => (a.imdbId || '').localeCompare(b.imdbId || ''))

      movies.value = movieEntries
    } catch (err) {
      console.error('Failed to load movies:', err)
    } finally {
      isLoading.value.movies = false
      isInitialLoading.value = false
    }
  }

  /**
   * Filter movies by source type
   * @param sourceType - Type of source to filter by ('archive.org' or 'youtube')
   * @returns Filtered array of movies
   */
  const filterBySource = (sourceType: MovieSourceType): MovieEntry[] => {
    return movies.value.filter((movie: MovieEntry) =>
      movie.sources.some((source: MovieSource) => source.type === sourceType)
    )
  }

  /**
   * Search movies by title, year, genre, or other metadata using Fuse.js
   * @param query - Search query string
   * @returns Filtered array of movies matching the query
   */
  const searchMovies = (query: string): MovieEntry[] => {
    if (!query || !query.trim()) return movies.value

    if (fuse.value) {
      const results = fuse.value.search(query)
      return results.map(r => r.item)
    }

    // Fallback to simple search if Fuse is not initialized
    const lowerQuery = query.toLowerCase()
    return movies.value.filter((movie: MovieEntry) => {
      // Search in title(s) - handle both string and string[] titles
      const titles = Array.isArray(movie.title) ? movie.title : [movie.title]
      const titleMatch = titles.some(
        title => typeof title === 'string' && title.toLowerCase().includes(lowerQuery)
      )
      if (titleMatch) return true

      // Search in original titles from sources
      const originalTitleMatch = movie.sources.some(
        source =>
          source.title &&
          typeof source.title === 'string' &&
          source.title.toLowerCase().includes(lowerQuery)
      )
      if (originalTitleMatch) return true

      // Search in year
      if (movie.year?.toString().includes(lowerQuery)) return true

      // Search in metadata
      if (movie.metadata) {
        const { Genre, Director, Actors, Plot } = movie.metadata
        if (Genre?.toLowerCase().includes(lowerQuery)) return true
        if (Director?.toLowerCase().includes(lowerQuery)) return true
        if (Actors?.toLowerCase().includes(lowerQuery)) return true
        if (Plot?.toLowerCase().includes(lowerQuery)) return true
      }

      return false
    })
  }

  /**
   * Get a single movie by imdbId
   * @param imdbId - IMDB ID or temporary ID
   * @returns Movie entry or undefined
   */
  const getMovieById = (imdbId: string): MovieEntry | undefined => {
    return movies.value.find((movie: MovieEntry) => movie.imdbId === imdbId)
  }

  /**
   * Get movies that have OMDB metadata
   * @returns Array of movies with metadata
   */
  const getEnrichedMovies = (): MovieEntry[] => {
    return movies.value.filter((movie: MovieEntry) => movie.metadata !== undefined)
  }

  /**
   * Get movies without OMDB metadata (need enrichment)
   * @returns Array of movies without metadata
   */
  const getUnenrichedMovies = (): MovieEntry[] => {
    return movies.value.filter((movie: MovieEntry) => movie.metadata === undefined)
  }

  /**
   * Check if a local poster exists for the given imdbId
   * Uses cache to avoid repeated network requests
   * @param imdbId - IMDB ID to check
   * @returns Promise<boolean> indicating whether the poster exists locally
   */
  const posterExists = async (imdbId: string): Promise<boolean> => {
    if (!imdbId) return false

    // Check cache first
    if (posterCache.value.has(imdbId)) {
      return posterCache.value.get(imdbId)!
    }

    try {
      // Try to fetch the local poster with HEAD request to avoid downloading
      const response = await fetch(`/posters/${imdbId}.jpg`, { method: 'HEAD' })
      const exists = response.ok
      posterCache.value.set(imdbId, exists)
      return exists
    } catch {
      posterCache.value.set(imdbId, false)
      return false
    }
  }

  /**
   * Get the best available poster URL with fallback logic
   * Priority: local cache -> OMDB URL -> placeholder
   * @param movie - Movie entry
   * @returns Promise<string> - URL to the poster image
   */
  const getPosterUrl = async (movie: MovieEntry): Promise<string> => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    // Check for local poster first (best performance)
    const hasLocal = await posterExists(movie.imdbId)
    if (hasLocal) {
      return `/posters/${movie.imdbId}.jpg`
    }

    // Fallback to OMDB poster URL if available
    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    // Final fallback to placeholder
    return placeholder
  }

  /**
   * Get poster URL synchronously (for SSR or when you know the status)
   * This version doesn't check if the local file exists - assumes you've already checked
   * @param movie - Movie entry
   * @param preferLocal - Whether to prefer local path (default: true)
   * @returns string - URL to the poster image
   */
  const getPosterUrlSync = (movie: MovieEntry, preferLocal: boolean = true): string => {
    const placeholder = '/images/poster-placeholder.jpg'

    if (!movie.imdbId) return placeholder

    // If preferLocal, return local path (browser will handle 404 gracefully)
    if (preferLocal) {
      return `/posters/${movie.imdbId}.jpg`
    }

    // Otherwise use OMDB poster URL
    const omdbPoster = movie.metadata?.Poster
    if (omdbPoster && omdbPoster !== 'N/A') {
      return omdbPoster
    }

    return placeholder
  }

  /**
   * Preload posters for multiple movies (batch check)
   * @param imdbIds - Array of IMDB IDs to check
   * @returns Promise<Map<string, boolean>> - Map of imdbId to existence status
   */
  const preloadPosters = async (imdbIds: string[]): Promise<Map<string, boolean>> => {
    const results = new Map<string, boolean>()

    // Check all posters in parallel (but limit concurrency to avoid overwhelming the server)
    const batchSize = 10
    for (let i = 0; i < imdbIds.length; i += batchSize) {
      const batch = imdbIds.slice(i, i + batchSize)
      const promises = batch.map(async imdbId => {
        const exists = await posterExists(imdbId)
        results.set(imdbId, exists)
      })
      await Promise.all(promises)
    }

    return results
  }

  /**
   * Get all sources for a movie grouped by type
   * @param movie - Movie entry
   * @returns Object with sources grouped by type
   */
  const getSourcesByType = (movie: MovieEntry): Record<MovieSourceType, MovieSource[]> => {
    return movie.sources.reduce(
      (grouped: Record<MovieSourceType, MovieSource[]>, source: MovieSource) => {
        grouped[source.type].push(source)
        return grouped
      },
      {
        'archive.org': [],
        youtube: [],
      } as Record<MovieSourceType, MovieSource[]>
    )
  }

  /**
   * Get the primary source for a movie (first source, or highest quality)
   * @param movie - Movie entry
   * @returns Primary movie source
   */
  const getPrimarySource = (movie: MovieEntry): MovieSource | undefined => {
    if (movie.sources.length === 0) return undefined

    // Prefer archive.org sources (usually higher quality)
    const archiveSources = movie.sources.filter((s: MovieSource) => s.type === 'archive.org')
    if (archiveSources.length > 0) {
      // Sort by downloads if available
      const sorted = [...archiveSources].sort((a: MovieSource, b: MovieSource) => {
        const aDownloads = 'downloads' in a ? a.downloads || 0 : 0
        const bDownloads = 'downloads' in b ? b.downloads || 0 : 0
        return bDownloads - aDownloads
      })
      return sorted[0]
    }

    // Otherwise return first YouTube source
    return movie.sources[0]
  }

  /**
   * Runtime OMDB enrichment (optional, for movies without metadata)
   * This can be used to fetch metadata on-demand for movies that don't have it yet
   * @param movie - Movie entry to enrich
   * @returns Updated movie metadata or null if failed
   */
  const enrichMovieMetadata = async (movie: MovieEntry) => {
    isLoading.value.imdbFetch = true

    const apiKey = useRuntimeConfig().public.OMDB_API_KEY
    if (!apiKey) {
      isLoading.value.imdbFetch = false
      return null
    }

    try {
      // Only enrich if we have a valid IMDB ID (not temporary)
      if (!movie.imdbId.startsWith('tt')) {
        isLoading.value.imdbFetch = false
        return null
      }

      const metadata = await $fetch<MovieMetadata>('https://www.omdbapi.com/', {
        params: {
          apikey: apiKey,
          i: movie.imdbId,
          plot: 'full',
        },
      })

      if (metadata && 'Error' in metadata) {
        isLoading.value.imdbFetch = false
        return null
      }

      // Update the movie in our local state
      const movieIndex = movies.value.findIndex((m: MovieEntry) => m.imdbId === movie.imdbId)
      if (movieIndex !== -1 && movies.value[movieIndex]) {
        movies.value[movieIndex]!.metadata = metadata
      }

      isLoading.value.imdbFetch = false
      return metadata
    } catch {
      isLoading.value.imdbFetch = false
      return null
    }
  }

  return {
    // State
    movies,
    isLoading,
    isInitialLoading,

    // Data loading
    loadFromFile,

    // Filtering & search
    filterBySource,
    searchMovies,
    getMovieById,
    getEnrichedMovies,
    getUnenrichedMovies,

    // Source utilities
    getSourcesByType,
    getPrimarySource,

    // Poster utilities
    posterExists,
    getPosterUrl,
    getPosterUrlSync,
    preloadPosters,

    // Runtime enrichment (optional)
    enrichMovieMetadata,
  }
})
