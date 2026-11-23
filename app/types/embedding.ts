/**
 * Unified interface for embedding providers in the browser.
 */
export interface EmbeddingProvider {
  /** Name of the model provider */
  readonly name: string
  /** Dimensions of the generated embedding vectors */
  readonly dimensions: number
  /** Maximum number of tokens/text length supported */
  readonly maxTokens: number
  /** Quantization format of the generated embedding vectors */
  readonly quantization: 'float32' | 'int8'

  /**
   * Initializes the model (downloads and loads into memory if necessary).
   * @param baseURL The base URL for loading model files (e.g., '/movies/')
   * @param onProgress Optional callback for loading progress (0-1)
   */
  init(baseURL: string, onProgress?: (progress: number) => void): Promise<void>

  /**
   * Returns true if the model is loaded and ready for inference.
   */
  isReady(): boolean

  /**
   * Generates an embedding for the given text.
   * @param text The input text to embed
   * @returns A Float32Array or Int8Array containing the embedding vector
   */
  generateEmbedding(text: string): Promise<Float32Array | Int8Array>

  /**
   * Disposes of model resources and frees memory.
   */
  dispose(): Promise<void>
}
