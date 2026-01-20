import { useDatabase } from './useDatabase'
import { useBrowserEmbedding } from './useBrowserEmbedding'

export function useVectorSearch() {
  const db = useDatabase()
  const browserEmbedding = useBrowserEmbedding()
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
      // 1. Generate embedding for the query
      // Auto-detect model from database config
      const modelInfo = await db.getEmbeddingModelInfo()

      let embedding: number[] | Float32Array

      // Route to browser or API based on model
      if (modelInfo?.id === 'bge-micro' || modelInfo?.id === 'potion') {
        const provider = modelInfo.id === 'bge-micro' ? 'bge' : 'potion'
        await browserEmbedding.init(provider)
        embedding = await browserEmbedding.embed(query)
      } else {
        const model = modelInfo?.ollamaModel || modelInfo?.id || 'nomic-embed-text'
        const response = await $fetch<{ embedding: number[] }>('/api/embeddings', {
          method: 'POST',
          body: { text: query, model },
        })

        if (!response.embedding) {
          throw new Error('Failed to generate embedding for query')
        }
        embedding = response.embedding
      }

      // 2. Perform vector search in the database worker
      const results = await db.vectorSearch(embedding, limit, where, params)
      return results
    } catch (err: unknown) {
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
      const movieEmbeddingResult = await db.query(
        'SELECT embedding FROM vec_movies WHERE movieId = ?',
        [movieId]
      )

      if (movieEmbeddingResult.length === 0) {
        return []
      }

      const firstResult = movieEmbeddingResult[0]
      const embedding = firstResult?.embedding as Uint8Array | undefined
      if (!embedding) {
        return []
      }

      // 2. Perform vector search using that embedding
      // We ask for limit + 1 because the movie itself will be the closest match
      // Convert Uint8Array from DB to Float32Array for vector search
      const float32Embedding = new Float32Array(
        embedding.buffer,
        embedding.byteOffset,
        embedding.byteLength / 4
      )
      const results = await db.vectorSearch(float32Embedding, limit + 1)

      // Filter out the current movie and return requested limit
      return results.filter(r => r.movieId !== movieId).slice(0, limit)
    } catch (err: unknown) {
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
    // Expose browser embedding state for UI feedback (e.g. loading progress)
    embeddingProgress: browserEmbedding.progress,
    isEmbeddingLoading: browserEmbedding.isLoading,
  }
}
