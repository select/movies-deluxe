import { BgeEmbeddingProvider } from '../utils/embedding/bgeEmbedding'
import { PotionEmbeddingProvider } from '../utils/embedding/potionEmbedding'
import type { EmbeddingProvider } from '../types/embedding'

let currentProvider: EmbeddingProvider | null = null
let currentProviderName: 'bge' | 'potion' | null = null
let cachedBaseURL = '/'

self.onmessage = async (e: MessageEvent) => {
  const { type, provider, text, id, baseURL } = e.data

  try {
    if (type === 'init') {
      // Cache the baseURL for model loading
      if (baseURL) {
        cachedBaseURL = baseURL
      }

      if (currentProviderName === provider && currentProvider?.isReady()) {
        self.postMessage({ type: 'ready', provider })
        return
      }

      // Dispose existing provider if switching
      if (currentProvider) {
        await currentProvider.dispose()
      }

      if (provider === 'bge') {
        currentProvider = new BgeEmbeddingProvider()
      } else if (provider === 'potion') {
        currentProvider = new PotionEmbeddingProvider()
      } else {
        throw new Error(`Unknown provider: ${provider}`)
      }

      currentProviderName = provider
      await currentProvider.init(cachedBaseURL, progress => {
        // Report progress back to main thread
        self.postMessage({ type: 'progress', progress, provider })
      })

      self.postMessage({ type: 'ready', provider })
    } else if (type === 'embed') {
      if (!currentProvider) {
        throw new Error('No embedding provider initialized. Call "init" first.')
      }

      const embedding = await currentProvider.generateEmbedding(text)

      // Transfer the buffer for better performance
      self.postMessage({ type: 'embedding', id, embedding }, { transfer: [embedding.buffer] })
    } else if (type === 'dispose') {
      if (currentProvider) {
        await currentProvider.dispose()
        currentProvider = null
        currentProviderName = null
      }
      self.postMessage({ type: 'disposed' })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    // eslint-disable-next-line no-console
    console.error(`[EmbeddingWorker] Error in "${type}":`, error)
    self.postMessage({ type: 'error', message, id })
  }
}
