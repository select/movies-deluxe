import * as ort from 'onnxruntime-web'
import type { EmbeddingProvider } from '~/types/embedding'

interface TokenizerData {
  vocab: Map<string, number>
  unkTokenId: number
  padTokenId: number
  clsTokenId: number
  sepTokenId: number
}

/**
 * Clean text for BERT-based embedding models.
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

export class PotionEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'potion-base-2M'
  readonly dimensions = 64
  readonly maxTokens = 512

  private session: ort.InferenceSession | null = null
  private tokenizerData: TokenizerData | null = null
  private initializing = false

  async init(onProgress?: (progress: number) => void): Promise<void> {
    if (this.session && this.tokenizerData) return
    if (this.initializing) {
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    this.initializing = true
    try {
      if (onProgress) onProgress(0.1)

      // Fetch tokenizer from local /models/ directory (served from public/models/)
      const tokenizerUrl = '/models/potion-base-2M/tokenizer.json'
      const tokenizerResp = await fetch(tokenizerUrl)
      if (!tokenizerResp.ok) {
        throw new Error(`Failed to fetch tokenizer from ${tokenizerUrl}`)
      }
      const tokenizerJson = await tokenizerResp.json()
      this.tokenizerData = this.parseTokenizer(tokenizerJson)

      if (onProgress) onProgress(0.3)

      // Initialize ONNX runtime session with local model
      const modelUrl = '/models/potion-base-2M/onnx/model.onnx'

      // Note: In some browser environments, you might need to specify WASM paths:
      // ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

      this.session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
      })

      if (onProgress) onProgress(1.0)
    } finally {
      this.initializing = false
    }
  }

  private parseTokenizer(tokenizer: { model?: { vocab?: Record<string, number> } }): TokenizerData {
    const vocab = new Map<string, number>()
    if (tokenizer.model?.vocab) {
      for (const [token, id] of Object.entries(tokenizer.model.vocab)) {
        vocab.set(token, id as number)
      }
    }

    // Default BERT special token IDs
    return {
      vocab,
      unkTokenId: vocab.get('[UNK]') ?? 100,
      padTokenId: vocab.get('[PAD]') ?? 0,
      clsTokenId: vocab.get('[CLS]') ?? 101,
      sepTokenId: vocab.get('[SEP]') ?? 102,
    }
  }

  isReady(): boolean {
    return this.session !== null && this.tokenizerData !== null
  }

  private tokenize(text: string): number[] {
    if (!this.tokenizerData) throw new Error('Tokenizer not initialized')
    const { vocab, unkTokenId, clsTokenId, sepTokenId } = this.tokenizerData

    const cleanText = text.toLowerCase().trim()
    const words = cleanText.split(/\s+/).filter(w => w.length > 0)
    const tokens: number[] = [clsTokenId]

    for (const word of words) {
      if (tokens.length >= this.maxTokens - 1) break

      if (vocab.has(word)) {
        tokens.push(vocab.get(word)!)
      } else {
        // Simple WordPiece tokenization
        let remaining = word
        let isFirst = true

        while (remaining.length > 0 && tokens.length < this.maxTokens - 1) {
          let found = false
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

  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.session || !this.tokenizerData) {
      await this.init()
    }

    if (!this.session) {
      throw new Error('Failed to initialize Potion model session')
    }

    // Clean and truncate text for safety
    const cleanedText = cleanTextForEmbedding(text).slice(0, 2000)
    const tokenIds = this.tokenize(cleanedText)

    // Potion uses EmbeddingBag: needs input_ids and offsets
    const inputIds = new BigInt64Array(tokenIds.map(id => BigInt(id)))
    const offsets = new BigInt64Array([BigInt(0)])

    const inputIdsTensor = new ort.Tensor('int64', inputIds, [tokenIds.length])
    const offsetsTensor = new ort.Tensor('int64', offsets, [1])

    const feeds: Record<string, ort.Tensor> = {
      input_ids: inputIdsTensor,
      offsets: offsetsTensor,
    }

    const results = await this.session.run(feeds)
    const output = results.embeddings || Object.values(results)[0]

    if (!output) {
      throw new Error('No output from Potion model')
    }

    // Convert to Float32Array and normalize
    const embedding = new Float32Array(output.data as Float32Array)

    // L2 normalize
    let norm = 0
    for (let i = 0; i < embedding.length; i++) {
      const value = embedding[i]
      if (value !== undefined) {
        norm += value * value
      }
    }
    norm = Math.sqrt(norm)

    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        const value = embedding[i]
        if (value !== undefined) {
          embedding[i] = value / norm
        }
      }
    }

    return embedding
  }

  async dispose(): Promise<void> {
    // onnxruntime-web doesn't have a reliable dispose() in all versions
    // but we can help GC by clearing references.
    this.session = null
    this.tokenizerData = null
  }
}
