import { existsSync } from 'fs'
import { join } from 'path'
import type { PreTrainedModel, PreTrainedTokenizer } from '@huggingface/transformers'
import {
  LEAF_IR_DIMENSIONS,
  processLeafIrEmbedding,
} from '../../../shared/utils/embeddingQuantization'

// Lazy-loaded module and model references
let transformersModule: typeof import('@huggingface/transformers') | null = null
let tokenizer: PreTrainedTokenizer | null = null
let model: PreTrainedModel | null = null

/**
 * Maximum sequence length for MongoDB/mdbr-leaf-ir.
 */
export const LEAF_IR_MAX_TOKENS = 512

/**
 * Output embedding dimension (MRL truncated to 256d, int8 quantized)
 */
export const LEAF_IR_EMBEDDING_DIM = LEAF_IR_DIMENSIONS

/**
 * Lazily load the @huggingface/transformers module.
 * This avoids loading onnxruntime-node at server startup.
 */
async function getTransformersModule() {
  if (!transformersModule) {
    transformersModule = await import('@huggingface/transformers')
    // Configure transformers.js to use local models in public/models/
    transformersModule.env.localModelPath = join(process.cwd(), 'public', 'models')
    transformersModule.env.allowRemoteModels = false
  }
  return transformersModule
}

/**
 * Initialize the mdbr-leaf-ir tokenizer and ONNX model (q8).
 * Note: mdbr-leaf-ir ONNX outputs `sentence_embedding` directly, so we use
 * AutoTokenizer + AutoModel instead of pipeline('feature-extraction').
 */
export async function initLeafIrPipeline(): Promise<{
  tokenizer: PreTrainedTokenizer
  model: PreTrainedModel
}> {
  if (tokenizer && model) {
    return { tokenizer, model }
  }

  const { AutoTokenizer, AutoModel } = await getTransformersModule()

  tokenizer = await AutoTokenizer.from_pretrained('mdbr-leaf-ir', {
    local_files_only: true,
  })

  model = await AutoModel.from_pretrained('mdbr-leaf-ir', {
    dtype: 'q8',
    local_files_only: true,
  })

  return { tokenizer, model }
}

/**
 * Generate a 256-dimensional int8-quantized embedding for a movie document
 * using MongoDB/mdbr-leaf-ir (no query prefix for documents).
 */
export async function generateLeafIrEmbedding(text: string): Promise<Int8Array> {
  const { tokenizer: tok, model: mdl } = await initLeafIrPipeline()

  const inputs = await tok(text, {
    padding: true,
    truncation: true,
    max_length: LEAF_IR_MAX_TOKENS,
  })

  const output = await mdl(inputs)
  const sentenceEmbedding = output.sentence_embedding
  if (!sentenceEmbedding?.data) {
    throw new Error('mdbr-leaf-ir output missing sentence_embedding tensor')
  }

  const rawData = sentenceEmbedding.data as Float32Array
  return processLeafIrEmbedding(rawData)
}

/**
 * Check if the mdbr-leaf-ir model files are available in public/models/mdbr-leaf-ir.
 */
export async function checkLeafIrAvailability(): Promise<{ available: boolean; error?: string }> {
  const modelDir = join(process.cwd(), 'public', 'models', 'mdbr-leaf-ir')
  const onnxDataPath = join(modelDir, 'onnx', 'model_quantized.onnx_data')
  if (!existsSync(modelDir) || !existsSync(onnxDataPath)) {
    return {
      available: false,
      error: 'LEAF IR model not found in public/models/mdbr-leaf-ir',
    }
  }
  return { available: true }
}
