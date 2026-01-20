export interface EmbeddingModelConfig {
  id: string // 'nomic', 'bge-micro', 'potion'
  name: string // Display name
  dimensions: number // 768, 384, 64
  dbFileName: string // 'embeddings-nomic-movies.db'
  description: string // User-facing description
  ollamaModel?: string // Model name in Ollama (if supported)
  isDefault?: boolean // Default selection
}

export const EMBEDDING_MODELS: EmbeddingModelConfig[] = [
  {
    id: 'nomic',
    name: 'Nomic Embed Text',
    dimensions: 768,
    dbFileName: 'embeddings-nomic-movies.db',
    description: 'Best quality, 768 dimensions (current production)',
    ollamaModel: 'nomic-embed-text',
    isDefault: true,
  },
  {
    id: 'bge-micro',
    name: 'BGE Micro v2',
    dimensions: 384,
    dbFileName: 'embeddings-bge-micro-movies.db',
    description: 'Faster, smaller, 384 dimensions',
    ollamaModel: 'bge-m3', // Closest match in Ollama if available, or custom
  },
  {
    id: 'potion',
    name: 'Potion Base 2M',
    dimensions: 64,
    dbFileName: 'embeddings-potion-movies.db',
    description: 'Smallest/fastest, 64 dimensions',
  },
]

export function getModelConfig(modelId: string): EmbeddingModelConfig | undefined {
  return EMBEDDING_MODELS.find(m => m.id === modelId)
}

export function getDefaultModel(): EmbeddingModelConfig {
  return (EMBEDDING_MODELS.find(m => m.isDefault) || EMBEDDING_MODELS[0])!
}
