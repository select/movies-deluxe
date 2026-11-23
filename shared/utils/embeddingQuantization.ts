export type EmbeddingQuantization = 'float32' | 'int8'

export const LEAF_IR_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
export const LEAF_IR_DIMENSIONS = 256
export const LEAF_IR_INT8_RANGE = 0.3

/**
 * Truncates a Matryoshka (MRL) embedding vector to the target dimensions
 * and L2-normalizes the resulting vector.
 */
export function truncateAndNormalize(
  vector: Float32Array | number[],
  dimensions = LEAF_IR_DIMENSIONS
): Float32Array {
  const len = Math.min(dimensions, vector.length)
  const truncated = new Float32Array(dimensions)

  let sumSq = 0
  for (let i = 0; i < len; i++) {
    const val = vector[i]!
    truncated[i] = val
    sumSq += val * val
  }

  const norm = Math.sqrt(sumSq)
  if (norm > 0) {
    for (let i = 0; i < len; i++) {
      truncated[i] = truncated[i]! / norm
    }
  }

  return truncated
}

/**
 * Symmetric scalar quantization from Float32Array to Int8Array.
 * Clamps values to [-127, 127].
 */
export function quantizeToInt8(vector: Float32Array, range = LEAF_IR_INT8_RANGE): Int8Array {
  const quantized = new Int8Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    const v = vector[i]!
    quantized[i] = Math.max(-127, Math.min(127, Math.round((v / range) * 127)))
  }
  return quantized
}

/**
 * Truncates, L2-normalizes (to 256d), and int8-quantizes a raw LEAF IR embedding.
 */
export function processLeafIrEmbedding(rawVector: Float32Array | number[]): Int8Array {
  const normalized = truncateAndNormalize(rawVector, LEAF_IR_DIMENSIONS)
  return quantizeToInt8(normalized, LEAF_IR_INT8_RANGE)
}
