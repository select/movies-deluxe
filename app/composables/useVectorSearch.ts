import { useDatabase } from './useDatabase'
import { useBrowserEmbedding } from './useBrowserEmbedding'

// Default to bge-micro - runs in browser, good quality
// Options: 'bge-micro' (384d) or 'potion' (64d)
const DEFAULT_EMBEDDING_MODEL = 'bge-micro'

export function useVectorSearch() {
  const db = useDatabase()
  const browserEmbedding = useBrowserEmbedding()
  const movieStore = useMovieStore()
  const isSearching = ref(false)
  const isLoadingEmbeddings = ref(false)
  const error = ref<string | null>(null)

  /**
   * Ensure embeddings are loaded before performing vector search.
   * Auto-loads embeddings if not already loaded.
   * @returns true if embeddings are ready, false if loading failed
   */
  const ensureEmbeddingsLoaded = async (): Promise<boolean> => {
    // Already loaded
    if (movieStore.isEmbeddingsLoaded) {
      return true
    }

    // Already loading (from another call or component)
    if (movieStore.isEmbeddingsLoading) {
      isLoadingEmbeddings.value = true
      // Wait for loading to complete by polling
      while (movieStore.isEmbeddingsLoading) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      isLoadingEmbeddings.value = false
      return movieStore.isEmbeddingsLoaded
    }

    // Need to load embeddings
    isLoadingEmbeddings.value = true
    try {
      await movieStore.loadEmbeddings(DEFAULT_EMBEDDING_MODEL)
      return true
    } catch (err) {
      console.error('[useVectorSearch] Failed to load embeddings:', err)
      error.value = 'Failed to load embeddings database. Semantic search is unavailable.'
      return false
    } finally {
      isLoadingEmbeddings.value = false
    }
  }

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
      // Ensure embeddings are loaded before searching
      const embeddingsReady = await ensureEmbeddingsLoaded()
      if (!embeddingsReady) {
        error.value = 'Embeddings database not available. Please try again later.'
        return []
      }

      // 1. Generate embedding for the query using browser-based model
      // Auto-detect model from database config
      const modelInfo = await db.getEmbeddingModelInfo()

      // Only bge-micro and potion are supported in browser
      const modelId = modelInfo?.id
      if (modelId !== 'bge-micro' && modelId !== 'potion') {
        error.value = `Unsupported embedding model: ${modelId}. Only bge-micro and potion work in browser.`
        return []
      }

      const provider = modelId === 'bge-micro' ? 'bge' : 'potion'
      await browserEmbedding.init(provider)
      const embedding = await browserEmbedding.embed(query)

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
      // Ensure embeddings are loaded before searching
      const embeddingsReady = await ensureEmbeddingsLoaded()
      if (!embeddingsReady) {
        error.value = 'Embeddings database not available. Cannot find similar movies.'
        return []
      }

      // 1. Get the embedding for the movie from the database
      // We need to use a raw query because vectorSearch expects the embedding blob
      const movieEmbeddingResult = await db.query(
        'SELECT embedding FROM embeddings_db.vec_movies WHERE movieId = ?',
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
    isLoadingEmbeddings,
    error,
    // Expose browser embedding state for UI feedback (e.g. loading progress)
    embeddingProgress: browserEmbedding.progress,
    isEmbeddingLoading: browserEmbedding.isLoading,
  }
}
