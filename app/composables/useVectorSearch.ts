import { useDatabase } from './useDatabase'
import type { MovieEntry } from '~/types'

export function useVectorSearch() {
  const db = useDatabase()
  const isSearching = ref(false)
  const error = ref<string | null>(null)

  /**
   * Perform a semantic search using a natural language query.
   *
   * @param query - The search query (e.g., "movies about time travel")
   * @param limit - Maximum number of results to return
   * @param where - Optional SQL WHERE clause for filtering
   * @param params - Optional parameters for the WHERE clause
   * @returns Promise of movie entries with their similarity distance
   */
  const search = async (
    query: string,
    limit: number = 20,
    where?: string,
    params?: (string | number)[]
  ) => {
    if (!query.trim()) return []

    isSearching.value = true
    error.value = null

    try {
      // 1. Generate embedding for the query via server API
      const response = await $fetch<{ embedding: number[] }>('/api/embeddings', {
        method: 'POST',
        body: { text: query },
      })

      if (!response.embedding) {
        throw new Error('Failed to generate embedding for query')
      }

      // 2. Perform vector search in the database worker
      const results = await db.vectorSearch<MovieEntry>(response.embedding, limit, where, params)
      return results
    } catch (err: unknown) {
      console.error('Vector search failed:', err)
      error.value = err instanceof Error ? err.message : 'Search failed'
      return []
    } finally {
      isSearching.value = false
    }
  }

  /**
   * Find similar movies for a given movie ID using vector similarity.
   *
   * @param movieId - The IMDB ID of the movie to find similar movies for
   * @param limit - Maximum number of results to return
   * @returns Promise of movie entries with their similarity distance
   */
  const findSimilar = async (movieId: string, limit: number = 10) => {
    if (!movieId) return []

    isSearching.value = true
    error.value = null

    try {
      // 1. Get the embedding for the movie from the database
      // We need to use a raw query because vectorSearch expects the embedding blob
      const movieEmbeddingResult = await db.query<{ embedding: Uint8Array }>(
        'SELECT embedding FROM vec_movies WHERE movieId = ?',
        [movieId]
      )

      if (movieEmbeddingResult.length === 0) {
        console.warn(`No embedding found for movie ${movieId}`)
        return []
      }

      const embedding = movieEmbeddingResult[0].embedding

      // 2. Perform vector search using that embedding
      // We ask for limit + 1 because the movie itself will be the closest match
      const results = await db.vectorSearch<MovieEntry>(embedding, limit + 1)

      // Filter out the current movie and return requested limit
      return results.filter(r => r.movieId !== movieId).slice(0, limit)
    } catch (err: unknown) {
      console.error('Find similar movies failed:', err)
      error.value = err instanceof Error ? err.message : 'Search failed'
      return []
    } finally {
      isSearching.value = false
    }
  }

  return {
    search,
    findSimilar,
    isSearching,
    error,
  }
}
