import { join } from 'path'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

// Lazy-loaded module reference
let transformersModule: typeof import('@huggingface/transformers') | null = null
let embeddingPipeline: FeatureExtractionPipeline | null = null

/**
 * Maximum sequence length for bge-micro-v2.
 * The model's positional embeddings are fixed at 512 tokens.
 */
export const BGE_MICRO_MAX_TOKENS = 512

/**
 * Embedding dimension for BGE Micro v2
 */
export const BGE_MICRO_EMBEDDING_DIM = 384

/**
 * Approximate max characters to stay under 512 tokens.
 * Using very conservative ~2 chars/token to handle edge cases.
 */
const MAX_CHARS = 1000

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
      // Normalize accented characters to ASCII equivalents (e -> e, n -> n, u -> u)
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

/**
 * Lazily load the @huggingface/transformers module.
 * This avoids loading onnxruntime-node at server startup.
 */
async function getTransformersModule() {
  if (!transformersModule) {
    transformersModule = await import('@huggingface/transformers')
    // Configure transformers.js to use local models
    transformersModule.env.localModelPath = join(process.cwd(), 'models')
    transformersModule.env.allowRemoteModels = false
  }
  return transformersModule
}

/**
 * Initialize the bge-micro-v2 embedding pipeline.
 * Uses the quantized ONNX model for better performance.
 */
export async function initBgeMicroPipeline(): Promise<FeatureExtractionPipeline> {
  if (embeddingPipeline) {
    return embeddingPipeline
  }

  const { pipeline } = await getTransformersModule()

  embeddingPipeline = (await pipeline('feature-extraction', 'bge-micro-v2', {
    dtype: 'q8',
    local_files_only: true,
  })) as FeatureExtractionPipeline

  return embeddingPipeline
}

/**
 * Generate a 384-dimensional embedding for the given text using bge-micro-v2.
 * The embedding is normalized (L2 norm = 1).
 * Text is cleaned and truncated to fit within the model's 512 token limit.
 *
 * @param text - The text to embed
 * @returns Float32Array of 384 dimensions
 */
export async function generateBgeMicroEmbedding(text: string): Promise<Float32Array> {
  const pipe = await initBgeMicroPipeline()

  // Clean text to remove URLs and problematic characters
  let cleanedText = cleanTextForEmbedding(text)

  // Truncate to stay within token limit
  if (cleanedText.length > MAX_CHARS) {
    cleanedText = cleanedText.slice(0, MAX_CHARS)
  }

  // Generate embedding with mean pooling and normalization
  const output = await pipe(cleanedText, {
    pooling: 'mean',
    normalize: true,
  })

  // Convert to Float32Array
  // The output is a Tensor, we need to get the data
  const data = output.tolist()[0] as number[]
  return new Float32Array(data)
}

/**
 * Check if the BGE model files are available.
 */
export async function checkBgeAvailability(): Promise<{ available: boolean; error?: string }> {
  const modelDir = join(process.cwd(), 'models', 'bge-micro-v2')
  const { existsSync } = await import('fs')
  if (!existsSync(modelDir)) {
    return {
      available: false,
      error: 'BGE Micro model not found in models/bge-micro-v2',
    }
  }
  return { available: true }
}
