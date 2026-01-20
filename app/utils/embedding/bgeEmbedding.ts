import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type { EmbeddingProvider } from '~/types/embedding'

/**
 * Clean text for BERT-based embedding models.
 * Removes URLs, normalizes accented characters to ASCII, and removes non-ASCII chars.
 */
function cleanTextForEmbedding(text: string): string {
  return (
    text
      // Remove URLs (http, https, www, bit.ly, etc.)
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/http:\/\/[^\s]+/gi, '')
      .replace(/www\.[^\s]+/gi, '')
      .replace(/bit\.ly\/[^\s]+/gi, '')
      // Remove email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      // Normalize accented characters to ASCII equivalents (é -> e, ñ -> n, ü -> u)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
      // Keep only printable ASCII (0x20-0x7E)
      .replace(/[^\x20-\x7E]/g, ' ')
      // Collapse multiple spaces into single space
      .replace(/\s+/g, ' ')
      // Trim
      .trim()
  )
}

export class BgeEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'bge-micro-v2'
  readonly dimensions = 384
  readonly maxTokens = 512

  private pipeline: FeatureExtractionPipeline | null = null
  private initializing = false

  async init(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipeline) return
    if (this.initializing) {
      // Wait for initialization to complete if already in progress
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    this.initializing = true
    try {
      this.pipeline = (await pipeline('feature-extraction', 'TaylorAI/bge-micro-v2', {
        dtype: 'q8',
        progress_callback: (info: { status: string; progress: number }) => {
          if (info.status === 'progress' && onProgress) {
            // progress is 0-100 in transformers.js
            onProgress(info.progress / 100)
          }
        },
      })) as FeatureExtractionPipeline
    } finally {
      this.initializing = false
    }
  }

  isReady(): boolean {
    return this.pipeline !== null
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.pipeline) {
      await this.init()
    }

    if (!this.pipeline) {
      throw new Error('Failed to initialize BGE embedding pipeline')
    }

    // Clean text to remove URLs and problematic characters
    const cleanedText = cleanTextForEmbedding(text)

    const output = await this.pipeline(cleanedText, {
      pooling: 'mean',
      normalize: true,
    })

    const data = output.tolist()[0] as number[]
    return new Float32Array(data)
  }

  async dispose(): Promise<void> {
    if (this.pipeline) {
      // @ts-expect-error - dispose() might not be present on all pipeline types in @huggingface/transformers
      if (typeof this.pipeline.dispose === 'function') {
        // @ts-expect-error - dispose() might not be present on all pipeline types in @huggingface/transformers
        await this.pipeline.dispose()
      }
      this.pipeline = null
    }
  }
}
