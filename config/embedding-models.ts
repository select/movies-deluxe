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
    id: 'bge-micro',
    name: 'BGE Micro v2',
    dimensions: 384,
    dbFileName: 'embeddings-bge-micro-movies.db',
    description: 'Good quality, runs in browser (384 dimensions)',
    isDefault: true,
  },
  {
    id: 'potion',
    name: 'Potion Base 2M',
    dimensions: 64,
    dbFileName: 'embeddings-potion-movies.db',
    description: 'Smallest/fastest, runs in browser (64 dimensions)',
  },
  {
    id: 'nomic',
    name: 'Nomic Embed Text',
    dimensions: 768,
    dbFileName: 'embeddings-nomic-movies.db',
    description: 'Best quality, server-only via Ollama (768 dimensions)',
    ollamaModel: 'nomic-embed-text',
    // Note: nomic requires Ollama server, not available in browser
  },
]

export function getModelConfig(modelId: string): EmbeddingModelConfig | undefined {
  return EMBEDDING_MODELS.find(m => m.id === modelId)
}

export function getDefaultModel(): EmbeddingModelConfig {
  return (EMBEDDING_MODELS.find(m => m.isDefault) || EMBEDDING_MODELS[0])!
}
