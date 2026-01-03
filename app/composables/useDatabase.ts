import type { WorkerResponse, FilterOptionsResponse, LightweightMovie } from '~/types/database'
import type { Collection } from '~/types'

// Singleton instance
let dbInstance: ReturnType<typeof createDatabase> | null = null

function createDatabase() {
  const worker = ref<Worker | null>(null)
  const isReady = ref(false)
  const pendingQueries = new Map<
    string,
    { resolve: (value: WorkerResponse<unknown>) => void; reject: (reason?: Error) => void }
  >()

  const init = async (url?: string) => {
    if (worker.value) return

    const DatabaseWorker = await import('~/workers/database.worker?worker')
    worker.value = new DatabaseWorker.default()

    worker.value!.onmessage = e => {
      const { id, error } = e.data
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
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, { resolve, reject })
      worker.value!.postMessage({ type: 'init', id, url })
    }).then(() => {
      isReady.value = true
    })
  }

  const query = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse<unknown>) => resolve((data.result as T[]) ?? []),
        reject,
      })
      worker.value!.postMessage({ type: 'exec', id, sql, params: toRaw(params) })
    })
  }

  const extendedQuery = async <T = unknown>(options: {
    select?: string
    from: string
    where?: string
    params?: unknown[]
    groupBy?: string
    orderBy?: string
    limit?: number
    offset?: number
    includeCount?: boolean
  }): Promise<{ result: T[]; totalCount?: number }> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse<unknown>) =>
          resolve({ result: (data.result as T[]) ?? [], totalCount: data.totalCount }),
        reject,
      })

      // Clone options and ensure params is raw
      const rawOptions = { ...options }
      if (rawOptions.params) {
        rawOptions.params = toRaw(rawOptions.params)
      }

      worker.value!.postMessage({ type: 'query', id, ...rawOptions })
    })
  }

  const lightweightQuery = async (options: {
    where?: string
    params?: unknown[]
    orderBy?: string
    limit?: number
    offset?: number
    includeCount?: boolean
  }): Promise<{
    result: LightweightMovie[]
    totalCount?: number
  }> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse<unknown>) =>
          resolve({
            result: (data.result as LightweightMovie[]) ?? [],
            totalCount: data.totalCount,
          }),
        reject,
      })

      // Clone options and ensure params is raw
      const rawOptions = { ...options }
      if (rawOptions.params) {
        rawOptions.params = toRaw(rawOptions.params)
      }

      worker.value!.postMessage({ type: 'query-lightweight', id, ...rawOptions })
    })
  }

  const queryByIds = async <T = MovieEntry>(imdbIds: string[]): Promise<T[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse<unknown>) => resolve((data.result as T[]) ?? []),
        reject,
      })
      // Use toRaw to ensure we don't pass Proxy objects to the worker
      worker.value!.postMessage({ type: 'query-by-ids', id, imdbIds: toRaw(imdbIds) })
    })
  }

  const getRelatedMovies = async <T = MovieEntry>(
    imdbId: string,
    limit: number = 8
  ): Promise<T[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse<unknown>) => resolve((data.result as T[]) ?? []),
        reject,
      })
      worker.value!.postMessage({ type: 'query-related', id, imdbId, limit })
    })
  }

  const getCollectionsForMovie = async (movieId: string): Promise<Collection[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: WorkerResponse<unknown>) => resolve((data.result as Collection[]) ?? []),
        reject,
      })
      worker.value!.postMessage({ type: 'query-collections-for-movie', id, movieId })
    })
  }

  const getFilterOptions = async (): Promise<FilterOptionsResponse> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
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

  return {
    init,
    query,
    extendedQuery,
    lightweightQuery,
    queryByIds,
    getRelatedMovies,
    getCollectionsForMovie,
    getFilterOptions,
    isReady,
  }
}

export function useDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase()
  }
  return dbInstance
}
