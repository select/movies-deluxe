/**
 * AI Provider Types
 */

export type AIProviderType = 'ollama' | 'openrouter'

export interface AIModelConfig {
  id: string
  name: string
  description: string
  costPerMillion?: number
  recommended?: boolean
}

export interface AIProviderConfig {
  id: AIProviderType
  name: string
  description: string
  requiresApiKey: boolean
  envVar?: string
  defaultModel: string
  models: AIModelConfig[]
}
