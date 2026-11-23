import {
  env,
  AutoTokenizer,
  AutoModel,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers'
import type { EmbeddingProvider } from '~/types/embedding'
import {
  LEAF_IR_QUERY_PREFIX,
  LEAF_IR_DIMENSIONS,
  processLeafIrEmbedding,
} from '#shared/utils/embeddingQuantization'

// Configure transformers.js to use local models only
env.allowLocalModels = true
env.allowRemoteModels = false

/**
 * Clean text for embedding models.
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

export class LeafIrEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mdbr-leaf-ir'
  readonly dimensions = LEAF_IR_DIMENSIONS
  readonly maxTokens = 512
  readonly quantization = 'int8' as const

  private tokenizer: PreTrainedTokenizer | null = null
  private model: PreTrainedModel | null = null
  private initializing = false

  async init(baseURL: string, onProgress?: (progress: number) => void): Promise<void> {
    if (this.tokenizer && this.model) return
    if (this.initializing) {
      // Wait for initialization to complete if already in progress
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    this.initializing = true
    try {
      const modelPath = `${baseURL}models/mdbr-leaf-ir/`
      this.tokenizer = await AutoTokenizer.from_pretrained(modelPath, {
        local_files_only: true,
      })
      this.model = await AutoModel.from_pretrained(modelPath, {
        dtype: 'q8',
        local_files_only: true,
        progress_callback: (info: { status: string; progress?: number }) => {
          if (info.status === 'progress' && info.progress !== undefined && onProgress) {
            // progress is 0-100 in transformers.js
            onProgress(info.progress / 100)
          }
        },
      })
    } finally {
      this.initializing = false
    }
  }

  isReady(): boolean {
    return this.tokenizer !== null && this.model !== null
  }

  async generateEmbedding(text: string): Promise<Int8Array> {
    if (!this.tokenizer || !this.model) {
      throw new Error('LEAF IR embedding model not initialized. Call init() first.')
    }

    const cleanedText = cleanTextForEmbedding(text)
    const prefixedText = `${LEAF_IR_QUERY_PREFIX}${cleanedText}`

    const inputs = this.tokenizer(prefixedText, {
      padding: true,
      truncation: true,
      max_length: this.maxTokens,
    })

    const { sentence_embedding } = (await this.model(inputs)) as {
      sentence_embedding?: { data: Float32Array }
    }

    if (!sentence_embedding) {
      throw new Error('No sentence_embedding output from LEAF IR model')
    }

    return processLeafIrEmbedding(sentence_embedding.data)
  }

  async dispose(): Promise<void> {
    if (this.model) {
      if (typeof this.model.dispose === 'function') {
        await this.model.dispose()
      }
      this.model = null
    }
    this.tokenizer = null
  }
}
