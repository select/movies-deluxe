import ollama from 'ollama'
import type { EmbeddingModelConfig } from '../../../config/embedding-models'

/**
 * Generate a single embedding using the Nomic model via Ollama.
 * @param text - The text to embed
 * @param modelConfig - The model configuration
 * @returns Float32Array of embedding dimensions
 */
export async function generateNomicEmbedding(
  text: string,
  modelConfig: EmbeddingModelConfig
): Promise<Float32Array> {
  const model = modelConfig.ollamaModel || 'nomic-embed-text'
  const response = await ollama.embeddings({
    model,
    prompt: text,
  })
  return new Float32Array(response.embedding)
}

/**
 * Check if Ollama is available and the Nomic model is loaded.
 */
export async function checkNomicAvailability(): Promise<{ available: boolean; error?: string }> {
  try {
    // Try to list models to check if Ollama is running
    const models = await ollama.list()
    const hasNomic = models.models.some(m => m.name.includes('nomic-embed-text'))
    if (!hasNomic) {
      return {
        available: false,
        error: 'Nomic model not found. Run: ollama pull nomic-embed-text',
      }
    }
    return { available: true }
  } catch {
    return {
      available: false,
      error: 'Ollama is not running. Start Ollama first.',
    }
  }
}
