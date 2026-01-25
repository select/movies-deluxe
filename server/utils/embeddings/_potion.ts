import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

// Lazy-loaded onnxruntime-node module
let ortModule: typeof import('onnxruntime-node') | null = null

// Model configuration
const MODEL_DIR = join(process.cwd(), 'models/potion-base-2M')
const ONNX_MODEL_PATH = join(MODEL_DIR, 'onnx/model.onnx')

/**
 * Embedding dimension for potion-base-2M (64-dimensional after PCA)
 */
export const POTION_EMBEDDING_DIM = 64

/**
 * Maximum sequence length
 */
export const POTION_MAX_TOKENS = 512

// Singleton session
let session: import('onnxruntime-node').InferenceSession | null = null

// Tokenizer data
interface TokenizerData {
  vocab: Map<string, number>
  unkTokenId: number
  padTokenId: number
  clsTokenId: number
  sepTokenId: number
}

let tokenizerData: TokenizerData | null = null

/**
 * Lazily load the onnxruntime-node module.
 * This avoids loading the native binding at server startup.
 */
async function getOrtModule() {
  if (!ortModule) {
    ortModule = await import('onnxruntime-node')
  }
  return ortModule
}

/**
 * Load the tokenizer vocabulary from tokenizer.json
 */
function loadTokenizer(): TokenizerData {
  if (tokenizerData) return tokenizerData

  const tokenizerPath = join(MODEL_DIR, 'tokenizer.json')
  const tokenizer = JSON.parse(readFileSync(tokenizerPath, 'utf-8'))

  // Build vocab map from tokenizer.json
  const vocab = new Map<string, number>()

  // The vocab is in model.vocab for WordPiece tokenizers
  if (tokenizer.model?.vocab) {
    for (const [token, id] of Object.entries(tokenizer.model.vocab)) {
      vocab.set(token, id as number)
    }
  }

  // Get special token IDs
  const unkTokenId = vocab.get('[UNK]') ?? 100
  const padTokenId = vocab.get('[PAD]') ?? 0
  const clsTokenId = vocab.get('[CLS]') ?? 101
  const sepTokenId = vocab.get('[SEP]') ?? 102

  tokenizerData = {
    vocab,
    unkTokenId,
    padTokenId,
    clsTokenId,
    sepTokenId,
  }

  return tokenizerData
}

/**
 * Simple WordPiece tokenization
 */
function tokenize(text: string, maxLength: number = POTION_MAX_TOKENS): number[] {
  const { vocab, unkTokenId, clsTokenId, sepTokenId } = loadTokenizer()

  // Lowercase and basic cleaning
  const cleanText = text.toLowerCase().trim()

  // Split into words
  const words = cleanText.split(/\s+/).filter(w => w.length > 0)

  const tokens: number[] = [clsTokenId]

  for (const word of words) {
    if (tokens.length >= maxLength - 1) break

    // Try to find the word in vocab
    if (vocab.has(word)) {
      tokens.push(vocab.get(word)!)
    } else {
      // WordPiece: try to break into subwords
      let remaining = word
      let isFirst = true

      while (remaining.length > 0 && tokens.length < maxLength - 1) {
        let found = false

        // Try progressively shorter prefixes
        for (let end = remaining.length; end > 0; end--) {
          const subword = isFirst ? remaining.slice(0, end) : '##' + remaining.slice(0, end)

          if (vocab.has(subword)) {
            tokens.push(vocab.get(subword)!)
            remaining = remaining.slice(end)
            isFirst = false
            found = true
            break
          }
        }

        if (!found) {
          // Unknown character, skip it
          tokens.push(unkTokenId)
          remaining = remaining.slice(1)
          isFirst = false
        }
      }
    }
  }

  tokens.push(sepTokenId)

  return tokens
}

/**
 * Clean text for embedding
 */
function cleanTextForEmbedding(text: string): string {
  return (
    text
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/www\.[^\s]+/gi, '')
      .replace(/bit\.ly\/[^\s]+/gi, '')
      // Remove email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      // Normalize accented characters to ASCII
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Keep only printable ASCII
      .replace(/[^\x20-\x7E]/g, ' ')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Initialize the ONNX inference session
 */
export async function initPotionPipeline(): Promise<import('onnxruntime-node').InferenceSession> {
  if (session) return session

  const ort = await getOrtModule()

  session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
    executionProviders: ['cpu'],
  })

  // Also load tokenizer
  loadTokenizer()

  return session
}

/**
 * Generate a 64-dimensional embedding for the given text using potion-base-2M.
 * The embedding is normalized (L2 norm = 1).
 *
 * @param text - The text to embed
 * @returns Float32Array of 64 dimensions
 */
export async function generatePotionEmbedding(text: string): Promise<Float32Array> {
  const ort = await getOrtModule()
  const sess = await initPotionPipeline()

  // Clean and truncate text
  let cleanedText = cleanTextForEmbedding(text)
  if (cleanedText.length > 2000) {
    cleanedText = cleanedText.slice(0, 2000)
  }

  // Tokenize
  const tokenIds = tokenize(cleanedText)

  // For EmbeddingBag models:
  // - input_ids is a 1D flattened array of all token IDs
  // - offsets indicates where each sequence starts (for batch processing)
  const inputIds = new BigInt64Array(tokenIds.map(id => BigInt(id)))
  const offsets = new BigInt64Array([BigInt(0)]) // Single sequence starting at index 0

  // Create ONNX tensors
  const inputIdsTensor = new ort.Tensor('int64', inputIds, [tokenIds.length])
  const offsetsTensor = new ort.Tensor('int64', offsets, [1])

  // Run inference
  const feeds: Record<string, import('onnxruntime-node').Tensor> = {
    input_ids: inputIdsTensor,
    offsets: offsetsTensor,
  }

  const results = await sess.run(feeds)

  // Get the output - should be shape [1, 64]
  const output = results['embeddings'] || Object.values(results)[0]

  if (!output) {
    throw new Error('No output from model')
  }

  // Convert to Float32Array and normalize
  const embedding = new Float32Array(output.data as Float32Array)

  // L2 normalize
  let norm = 0
  for (let i = 0; i < embedding.length; i++) {
    norm += embedding[i] * embedding[i]
  }
  norm = Math.sqrt(norm)

  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm
    }
  }

  return embedding
}

/**
 * Check if the Potion model files are available.
 */
export async function checkPotionAvailability(): Promise<{ available: boolean; error?: string }> {
  if (!existsSync(MODEL_DIR)) {
    return {
      available: false,
      error: 'Potion model not found in models/potion-base-2M',
    }
  }
  if (!existsSync(ONNX_MODEL_PATH)) {
    return {
      available: false,
      error: 'Potion ONNX model not found in models/potion-base-2M/onnx/model.onnx',
    }
  }
  return { available: true }
}
