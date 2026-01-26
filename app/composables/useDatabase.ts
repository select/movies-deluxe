import type { WorkerResponse, FilterOptionsResponse, VectorSearchResult } from '~/types/database'
import type { Collection } from '~/types'
import { getModelConfig, type EmbeddingModelConfig } from '~~/config/embedding-models'

// Singleton instance
let dbInstance: ReturnType<typeof createDatabase> | null = null

function createDatabase() {
  const worker = ref<Worker | null>(null)
  const isReady = ref(false)
  const embeddingsLoaded = ref(false)
  const embeddingsModelId = ref<string | null>(null)
  const embeddingsLoading = ref(false)
  const pendingQueries = new Map<
    string,
    { resolve: (value: WorkerResponse) => void; reject: (reason?: Error) => void }
  >()

  const initPromise = ref<Promise<void> | null>(null)
  const configCache = ref<Record<string, string> | null>(null)

  const init = async (url?: string, baseURL?: string): Promise<number> => {
    if (initPromise.value) {
      await initPromise.value
      return 0 // Already initialized, return 0 as we don't store the count
    }

    let totalMovies = 0

    initPromise.value = (async (): Promise<void> => {
      const DatabaseWorker = await import('~/workers/database.worker?worker')
      worker.value = new DatabaseWorker.default()

      worker.value!.onmessage = e => {
        const { id, error, type: responseType } = e.data

        // Handle initialization success message
        if (responseType === 'init-success') {
          isReady.value = true
          const pending = pendingQueries.get(id)
          if (pending) {
            pending.resolve(e.data)
            pendingQueries.delete(id)
          }
          return
        }

        // Handle attach-embeddings success message
        if (responseType === 'attach-success') {
          embeddingsLoaded.value = true
          embeddingsLoading.value = false
          const pending = pendingQueries.get(id)
          if (pending) {
            pending.resolve(e.data)
            pendingQueries.delete(id)
          }
          return
        }

        // Handle detach-embeddings success message
        if (responseType === 'detach-success') {
          embeddingsLoaded.value = false
          embeddingsModelId.value = null
          const pending = pendingQueries.get(id)
          if (pending) {
            pending.resolve(e.data)
            pendingQueries.delete(id)
          }
          return
        }

        const pending = pendingQueries.get(id)

        if (pending) {
          if (error) {
            pending.reject(new Error(error))
          } else {
            pending.resolve(e.data)
          }
          pendingQueries.delete(id)
        }
      }

      const id = Math.random().toString(36).substring(7)
      return new Promise<void>((resolve, reject) => {
        pendingQueries.set(id, {
          resolve: (data: WorkerResponse) => {
            totalMovies = 'totalMovies' in data ? data.totalMovies : 0
            resolve()
          },
          reject,
        })
        worker.value!.postMessage({ type: 'init', id, url, baseURL })
      })
    })()

    await initPromise.value
    // Pre-fetch config to ensure metadata is available immediately
    await getConfig()
    return totalMovies
  }

  const query = async <T = Record<string, unknown>>(
    sql: string,
    params: (string | number)[] = []
  ): Promise<T[]> => {
    // Wait for worker to be created (init must be called first)
    if (initPromise.value) {
      await initPromise.value
    }
    if (!worker.value) {
      throw new Error('Database not initialized - call init() first')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse) => resolve(('result' in data ? data.result : []) as T[]),
        reject,
      })
      worker.value!.postMessage({ type: 'exec', id, sql, params: toRaw(params) })
    })
  }

  const queryByIds = async (movieIds: string[]): Promise<LightweightMovie[]> => {
    // Wait for worker to be created (init must be called first)
    if (initPromise.value) {
      await initPromise.value
    }
    if (!worker.value) {
      throw new Error('Database not initialized - call init() first')
    }

    // Build query using centralized query builder
    const { sql, params } = buildQueryByIdsQuery(movieIds)

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse) =>
          resolve(('result' in data ? data.result : []) as LightweightMovie[]),
        reject,
      })
      // Pass pre-built SQL to worker
      worker.value!.postMessage({
        type: 'query-by-ids',
        id,
        movieIds: toRaw(movieIds),
        sql,
        params: toRaw(params),
      })
    })
  }

  const getCollectionsForMovie = async (movieId: string): Promise<Collection[]> => {
    // Build query using centralized query builder
    const { sql, params } = buildCollectionsForMovieQuery(movieId)
    return query<Collection>(sql, params)
  }

  const getFilterOptions = async (): Promise<FilterOptionsResponse> => {
    // Build queries using centralized query builder
    const queries = buildFilterOptionsQueries()

    // Execute all three queries in parallel using the generic query function
    const [genres, countries, channels] = await Promise.all([
      query<FilterOptionsResponse['genres'][number]>(queries.genres.sql, queries.genres.params),
      query<FilterOptionsResponse['countries'][number]>(
        queries.countries.sql,
        queries.countries.params
      ),
      query<FilterOptionsResponse['channels'][number]>(
        queries.channels.sql,
        queries.channels.params
      ),
    ])

    return { genres, countries, channels }
  }

  const vectorSearch = async (
    embedding: Float32Array | number[],
    limit: number = 20,
    where?: string,
    whereParams?: (string | number)[]
  ): Promise<VectorSearchResult[]> => {
    // Wait for worker to be created (init must be called first)
    if (initPromise.value) {
      await initPromise.value
    }
    if (!worker.value) {
      throw new Error('Database not initialized - call init() first')
    }

    // Build query using centralized query builder
    const { sql, params } = buildVectorSearchQuery(limit, where, whereParams)

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse) =>
          resolve(('result' in data ? data.result : []) as VectorSearchResult[]),
        reject,
      })
      worker.value!.postMessage({
        type: 'vector-search',
        id,
        embedding: toRaw(embedding),
        limit,
        sql,
        params: toRaw(params),
      })
    })
  }

  const getConfig = async (): Promise<Record<string, string>> => {
    if (configCache.value) return configCache.value

    try {
      const rows = await query<{ key: string; value: string }>('SELECT key, value FROM config')
      const config = rows.reduce(
        (acc, row) => {
          acc[row.key] = row.value
          return acc
        },
        {} as Record<string, string>
      )

      configCache.value = config
      return config
    } catch {
      // Failed to fetch config from database (might be an old version)
      return {}
    }
  }

  /**
   * Get the embedding model info for the currently attached embeddings database.
   * Returns null if no embeddings database is attached.
   */
  const getEmbeddingModelInfo = async (): Promise<EmbeddingModelConfig | null> => {
    // Return model info based on the currently attached embeddings database
    if (!embeddingsLoaded.value || !embeddingsModelId.value) {
      return null
    }
    return getModelConfig(embeddingsModelId.value) || null
  }

  /**
   * Wait for the database to be ready
   * Returns immediately if already ready, otherwise waits for initialization
   */
  const waitForReady = async (): Promise<void> => {
    if (isReady.value) return
    if (initPromise.value) {
      await initPromise.value
    }
  }

  /**
   * Attach an embeddings database for a specific model
   * @param modelId - The model ID (e.g., 'nomic', 'bge-micro', 'potion')
   * @returns Promise that resolves with the embeddings count on success
   */
  const attachEmbeddings = async (modelId: string): Promise<number> => {
    // Wait for main database to be ready
    if (initPromise.value) {
      await initPromise.value
    }
    if (!worker.value) {
      throw new Error('Database not initialized - call init() first')
    }

    // If same model is already loaded, return early
    if (embeddingsLoaded.value && embeddingsModelId.value === modelId) {
      return 0
    }

    embeddingsLoading.value = true

    const baseURL = useRuntimeConfig().app.baseURL
    const url = `${baseURL}data/embeddings-${modelId}-movies.db`
    const id = Math.random().toString(36).substring(7)

    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse) => {
          embeddingsModelId.value = modelId
          const count = ('embeddingsCount' in data ? data.embeddingsCount : 0) as number
          resolve(count)
        },
        reject: (error?: Error) => {
          embeddingsLoading.value = false
          embeddingsLoaded.value = false
          embeddingsModelId.value = null
          reject(error)
        },
      })
      worker.value!.postMessage({ type: 'attach-embeddings', id, url })
    })
  }

  /**
   * Detach the currently attached embeddings database
   */
  const detachEmbeddings = async (): Promise<void> => {
    // Wait for main database to be ready
    if (initPromise.value) {
      await initPromise.value
    }
    if (!worker.value) {
      throw new Error('Database not initialized - call init() first')
    }

    // If no embeddings are loaded, return early
    if (!embeddingsLoaded.value) {
      return
    }

    const id = Math.random().toString(36).substring(7)

    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: () => resolve(),
        reject,
      })
      worker.value!.postMessage({ type: 'detach-embeddings', id })
    })
  }

  /**
   * Check if embeddings are currently loaded
   */
  const isEmbeddingsLoaded = computed(() => embeddingsLoaded.value)

  /**
   * Get the currently loaded embeddings model ID
   */
  const currentEmbeddingsModelId = computed(() => embeddingsModelId.value)

  /**
   * Check if embeddings are currently being loaded
   */
  const isEmbeddingsLoading = computed(() => embeddingsLoading.value)

  return {
    init,
    query,
    queryByIds,
    getCollectionsForMovie,
    getFilterOptions,
    vectorSearch,
    getConfig,
    getEmbeddingModelInfo,
    isReady,
    waitForReady,
    attachEmbeddings,
    detachEmbeddings,
    isEmbeddingsLoaded,
    currentEmbeddingsModelId,
    isEmbeddingsLoading,
  }
}

export function useDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase()
  }
  return dbInstance
}
