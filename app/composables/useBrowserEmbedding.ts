// @ts-expect-error - Vite worker import
import EmbeddingWorker from '~/workers/embedding.worker?worker'

export function useBrowserEmbedding() {
  const isLoading = ref(false)
  const isReady = ref(false)
  const error = ref<string | null>(null)
  const progress = ref(0)
  const currentProvider = ref<'bge' | 'potion' | null>(null)

  let worker: Worker | null = null
  const pendingRequests = new Map<
    number,
    {
      resolve: (value: Float32Array) => void
      reject: (reason?: unknown) => void
    }
  >()
  let nextRequestId = 0

  function initWorker() {
    if (worker) return worker

    worker = new EmbeddingWorker() as Worker
    worker.onmessage = (e: MessageEvent) => {
      const { type, progress: p, provider, embedding, id, message } = e.data

      if (type === 'progress') {
        progress.value = Math.round(p * 100)
      } else if (type === 'ready') {
        isReady.value = true
        isLoading.value = false
        currentProvider.value = provider
        progress.value = 100
      } else if (type === 'embedding') {
        const req = pendingRequests.get(id)
        if (req) {
          req.resolve(embedding)
          pendingRequests.delete(id)
        }
      } else if (type === 'error') {
        const req = pendingRequests.get(id)
        if (req) {
          req.reject(new Error(message))
          pendingRequests.delete(id)
        } else {
          error.value = message
          isLoading.value = false
        }
      }
    }

    worker.onerror = err => {
      // eslint-disable-next-line no-console
      console.error('[EmbeddingWorker] Fatal error:', err)
      error.value = 'Web Worker failed to start'
      isLoading.value = false
    }

    return worker
  }

  /**
   * Initialize the embedding provider.
   */
  const init = async (provider: 'bge' | 'potion') => {
    if (currentProvider.value === provider && isReady.value) return

    isLoading.value = true
    isReady.value = false
    error.value = null
    progress.value = 0

    const w = initWorker()
    w.postMessage({ type: 'init', provider })

    // Wait for ready state or error
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now()
      const timeout = 60000 // 60 seconds timeout for model loading

      const check = () => {
        if (isReady.value && currentProvider.value === provider) {
          resolve()
        } else if (error.value) {
          reject(new Error(error.value))
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout loading embedding model'))
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })
  }

  /**
   * Generate an embedding for the given text.
   */
  const embed = async (text: string): Promise<Float32Array> => {
    if (!isReady.value) {
      throw new Error('Embedding system not ready. Call init() first.')
    }

    const id = nextRequestId++
    const w = initWorker()

    return new Promise<Float32Array>((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject })
      w.postMessage({ type: 'embed', text, id })
    })
  }

  /**
   * Dispose of worker and resources.
   */
  const dispose = async () => {
    if (worker) {
      worker.postMessage({ type: 'dispose' })
      worker.terminate()
      worker = null
    }
    isReady.value = false
    isLoading.value = false
    currentProvider.value = null
    pendingRequests.clear()
  }

  onBeforeUnmount(() => {
    dispose()
  })

  return {
    // State
    isLoading,
    isReady,
    error,
    progress,
    currentProvider,

    // Methods
    init,
    embed,
    dispose,
  }
}
