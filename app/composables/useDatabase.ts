export const useDatabase = () => {
  const worker = ref<Worker | null>(null)
  const isInitialized = ref(false)
  const pendingQueries = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >()

  const init = async () => {
    if (isInitialized.value) return

    return new Promise((resolve, reject) => {
      // Create worker
      worker.value = new Worker(new URL('../workers/database.worker.ts', import.meta.url))

      worker.value.onmessage = event => {
        const { type, payload, error, id } = event.data

        if (type === 'init') {
          if (error) {
            reject(new Error(error))
          } else {
            isInitialized.value = true
            resolve(payload)
          }
          return
        }

        const pending = pendingQueries.get(id)
        if (pending) {
          if (error) {
            pending.reject(new Error(error))
          } else {
            pending.resolve(payload)
          }
          pendingQueries.delete(id)
        }
      }

      worker.value.onerror = err => {
        reject(err)
      }

      // Send init message
      worker.value.postMessage({ type: 'init', id: 'init' })
    })
  }

  const query = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
    if (!isInitialized.value) {
      await init()
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, { resolve, reject })
      worker.value?.postMessage({ type: 'query', id, payload: { sql, params } })
    })
  }

  const exec = async (sql: string, params: any[] = []): Promise<{ success: boolean }> => {
    if (!isInitialized.value) {
      await init()
    }

    const id = Math.random().toString(36).substring(7)
    return new Promise((resolve, reject) => {
      pendingQueries.set(id, { resolve, reject })
      worker.value?.postMessage({ type: 'exec', id, payload: { sql, params } })
    })
  }

  return {
    init,
    query,
    exec,
    isInitialized,
  }
}
