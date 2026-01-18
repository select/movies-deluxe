import type { WorkerResponse, FilterOptionsResponse } from '~/types/database'
import type { Collection, MovieEntry } from '~/types'

// Singleton instance
let dbInstance: ReturnType<typeof createDatabase> | null = null

function createDatabase() {
  const worker = ref<Worker | null>(null)
  const isReady = ref(false)
  const pendingQueries = new Map<
    string,
    { resolve: (value: WorkerResponse) => void; reject: (reason?: Error) => void }
  >()

  const initPromise = ref<Promise<void> | null>(null)

  const init = async (url?: string): Promise<number> => {
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
            totalMovies = data.totalMovies || 0
            resolve()
          },
          reject,
        })
        worker.value!.postMessage({ type: 'init', id, url })
      })
    })()

    await initPromise.value
    return totalMovies
  }

  const query = async <T = Record<string, string | number>>(
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
        resolve: (data: WorkerResponse) => resolve((data.result as T[]) ?? []),
        reject,
      })
      worker.value!.postMessage({ type: 'exec', id, sql, params: toRaw(params) })
    })
  }

  const queryByIds = async <T = MovieEntry>(movieIds: string[]): Promise<T[]> => {
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
        resolve: (data: WorkerResponse) => resolve((data.result as T[]) ?? []),
        reject,
      })
      // Use toRaw to ensure we don't pass Proxy objects to the worker
      worker.value!.postMessage({ type: 'query-by-ids', id, movieIds: toRaw(movieIds) })
    })
  }

  const getCollectionsForMovie = async (movieId: string): Promise<Collection[]> => {
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
        resolve: (data: WorkerResponse) => resolve((data.result as Collection[]) ?? []),
        reject,
      })
      worker.value!.postMessage({ type: 'query-collections-for-movie', id, movieId })
    })
  }

  const getFilterOptions = async (): Promise<FilterOptionsResponse> => {
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
        resolve: (data: WorkerResponse) =>
          resolve({
            genres: data.genres ?? [],
            countries: data.countries ?? [],
            channels: data.channels ?? [],
          }),
        reject,
      })
      worker.value!.postMessage({ type: 'get-filter-options', id })
    })
  }

  const vectorSearch = async <T = MovieEntry>(
    embedding: Float32Array | number[],
    limit: number = 20,
    where?: string,
    params?: (string | number)[]
  ): Promise<(T & { distance: number })[]> => {
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
        resolve: (data: WorkerResponse) =>
          resolve((data.result as (T & { distance: number })[]) ?? []),
        reject,
      })
      worker.value!.postMessage({
        type: 'vector-search',
        id,
        embedding: toRaw(embedding),
        limit,
        where,
        params: toRaw(params),
      })
    })
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

  return {
    init,
    query,
    queryByIds,
    getCollectionsForMovie,
    getFilterOptions,
    vectorSearch,
    isReady,
    waitForReady,
  }
}

export function useDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase()
  }
  return dbInstance
}
