import type { MovieEntry, MovieSource, MovieSourceType, LoadingState } from '~/app/types'

export const useMovieStore = defineStore('movie', () => {
  // State
  const movies = ref<MovieEntry[]>([])
  const isLoading = ref<LoadingState>({
    movies: false,
    movieDetails: false,
    imdbFetch: false,
  })

  // Cached poster existence checks
  const posterCache = ref<Map<string, boolean>>(new Map())

  /**
   * Load movies from public/data/movies.json
   * Converts the object-based database to an array for easier use in components
   */
  const loadFromFile = async () => {
    isLoading.value.movies = true

    try {
      // Fetch the movies.json file from the public directory
      const response = await $fetch<Record<string, any>>('/data/movies.json')

      // Convert object to array, filtering out metadata entries
      const movieEntries: MovieEntry[] = Object.entries(response)
        .filter(([key]) => !key.startsWith('_'))
        .filter(
          ([, value]) => value && typeof value === 'object' && 'imdbId' in value && 'title' in value
        )
        .map(([, value]) => value as MovieEntry)

      movies.value = movieEntries
    } catch (error: any) {
      useMessageStore().showMessage({
        type: 'error',
        body: `Failed to load movies: ${error.message || 'Unknown error'}`,
      })
    } finally {
      isLoading.value.movies = false
    }
  }

  /**
   * Filter movies by source type
   * @param sourceType - Type of source to filter by ('archive.org' or 'youtube')
   * @returns Filtered array of movies
   */
  const filterBySource = (sourceType: MovieSourceType): MovieEntry[] => {
    return movies.value.filter(movie => movie.sources.some(source => source.type === sourceType))
  }

  /**
   * Search movies by title, year, genre, or other metadata
   * @param query - Search query string
   * @returns Filtered array of movies matching the query
   */
  const searchMovies = (query: string): MovieEntry[] => {
    if (!query.trim()) return movies.value

    const lowerQuery = query.toLowerCase()

    return movies.value.filter(movie => {
      // Search in title
      if (movie.title.toLowerCase().includes(lowerQuery)) return true

      // Search in AI extracted title
      if (movie.ai?.extractedTitle?.toLowerCase().includes(lowerQuery)) return true

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
    return movies.value.find(movie => movie.imdbId === imdbId)
  }

  /**
   * Get movies that have OMDB metadata
   * @returns Array of movies with metadata
   */
  const getEnrichedMovies = (): MovieEntry[] => {
    return movies.value.filter(movie => movie.metadata !== undefined)
  }

  /**
   * Get movies without OMDB metadata (need enrichment)
   * @returns Array of movies without metadata
   */
  const getUnenrichedMovies = (): MovieEntry[] => {
    return movies.value.filter(movie => movie.metadata === undefined)
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
      (grouped, source) => {
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
    const archiveSources = movie.sources.filter(s => s.type === 'archive.org')
    if (archiveSources.length > 0) {
      // Sort by downloads if available
      const sorted = [...archiveSources].sort((a, b) => {
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

      const metadata = await $fetch('https://www.omdbapi.com/', {
        params: {
          apikey: apiKey,
          i: movie.imdbId,
          plot: 'full',
        },
      })

      if (metadata.Error) {
        isLoading.value.imdbFetch = false
        return null
      }

      // Update the movie in our local state
      const movieIndex = movies.value.findIndex(m => m.imdbId === movie.imdbId)
      if (movieIndex !== -1) {
        movies.value[movieIndex].metadata = metadata
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
