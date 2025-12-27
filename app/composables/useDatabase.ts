// Singleton instance
let dbInstance: ReturnType<typeof createDatabase> | null = null

function createDatabase() {
  const worker = ref<Worker | null>(null)
  const isReady = ref(false)
  const pendingQueries = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
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

  const query = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: any) => resolve(data.result),
        reject,
      })
      worker.value!.postMessage({ type: 'exec', id, sql, params })
    })
  }

  const extendedQuery = async <T = any>(options: {
    select?: string
    from: string
    where?: string
    params?: any[]
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
        resolve: (data: any) => resolve({ result: data.result, totalCount: data.totalCount }),
        reject,
      })
      worker.value!.postMessage({ type: 'query', id, ...options })
    })
  }

  const lightweightQuery = async (options: {
    where?: string
    params?: any[]
    orderBy?: string
    limit?: number
    offset?: number
    includeCount?: boolean
  }): Promise<{
    result: Array<{ imdbId: string; title: string; year: number }>
    totalCount?: number
  }> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: any) => resolve({ result: data.result, totalCount: data.totalCount }),
        reject,
      })
      worker.value!.postMessage({ type: 'query-lightweight', id, ...options })
    })
  }

  const queryByIds = async (imdbIds: string[]): Promise<any[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: any) => resolve(data.result),
        reject,
      })
      worker.value!.postMessage({ type: 'query-by-ids', id, imdbIds })
    })
  }

  const queryRelatedMovies = async (imdbId: string, limit: number = 8): Promise<any[]> => {
    if (!isReady.value) {
      throw new Error('Database not initialized')
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, {
        resolve: (data: any) => resolve(data.result),
        reject,
      })
      worker.value!.postMessage({ type: 'query-related', id, imdbId, limit })
    })
  }

  return {
    init,
    query,
    extendedQuery,
    lightweightQuery,
    queryByIds,
    queryRelatedMovies,
    isReady,
  }
}

export function useDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase()
  }
  return dbInstance
}
