export interface EmbeddingModelConfig {
  id: string // 'leaf-ir'
  name: string // Display name
  dimensions: number // 256
  quantization?: 'float32' | 'int8'
  dbFileName: string // 'embeddings-leaf-ir-movies.db'
  description: string // User-facing description
  isDefault?: boolean // Default selection
}

export const EMBEDDING_MODELS: EmbeddingModelConfig[] = [
  {
    id: 'leaf-ir',
    name: 'LEAF IR',
    dimensions: 256,
    quantization: 'int8',
    dbFileName: 'embeddings-leaf-ir-movies.db',
    description: 'Best quality-to-size ratio, runs in browser (256D int8 quantized)',
    isDefault: true,
  },
]

export function getModelConfig(modelId: string): EmbeddingModelConfig | undefined {
  return EMBEDDING_MODELS.find(m => m.id === modelId)
}

export function getDefaultModel(): EmbeddingModelConfig {
  return (EMBEDDING_MODELS.find(m => m.isDefault) || EMBEDDING_MODELS[0])!
}
