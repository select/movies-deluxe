/**
 * AI Provider Configuration
 *
 * Defines available AI providers and models for metadata extraction.
 * Each provider has a default model and optional alternatives.
 */

export type AIProviderType = 'ollama' | 'openrouter'

export interface AIModelConfig {
  id: string // Model identifier (e.g., 'openai/gpt-4o-mini')
  name: string // Display name
  description: string // User-facing description
  costPerMillion?: number // Cost per million tokens (USD) - for OpenRouter
  recommended?: boolean // Recommended for metadata extraction
}

export interface AIProviderConfig {
  id: AIProviderType
  name: string // Display name
  description: string // User-facing description
  requiresApiKey: boolean
  envVar?: string // Environment variable for API key
  defaultModel: string // Default model ID
  models: AIModelConfig[]
}

/**
 * Ollama provider configuration
 * Local AI models - free, requires Ollama server
 */
const ollamaProvider: AIProviderConfig = {
  id: 'ollama',
  name: 'Ollama',
  description: 'Local AI models - free, requires Ollama server running',
  requiresApiKey: false,
  defaultModel: 'gemma3:4b',
  models: [
    {
      id: 'gemma3:4b',
      name: 'Gemma 3 4B',
      description: 'Fast, efficient model for metadata extraction',
      recommended: true,
    },
    {
      id: 'gemma3:12b',
      name: 'Gemma 3 12B',
      description: 'Higher quality, slower than 4B variant',
    },
    {
      id: 'llama3.2:3b',
      name: 'Llama 3.2 3B',
      description: 'Compact Meta model, good for simple tasks',
    },
    {
      id: 'mistral:7b',
      name: 'Mistral 7B',
      description: 'Balanced performance and quality',
    },
    {
      id: 'qwen2.5:7b',
      name: 'Qwen 2.5 7B',
      description: 'Strong multilingual support',
    },
  ],
}

/**
 * OpenRouter provider configuration
 * Cloud AI models via Groq - requires API key, pay-per-use
 */
const openrouterProvider: AIProviderConfig = {
  id: 'openrouter',
  name: 'OpenRouter',
  description: 'Cloud AI models via Groq - requires API key, pay-per-use',
  requiresApiKey: true,
  envVar: 'OPENROUTER_API_KEY',
  defaultModel: 'qwen/qwen3-32b',
  models: [
    {
      id: 'qwen/qwen3-32b',
      name: 'Qwen 3 32B',
      description: 'Powerful reasoning model via Groq, excellent for metadata extraction',
      recommended: true,
    },
    {
      id: 'openai/gpt-oss-20b',
      name: 'GPT OSS 20B',
      description: 'Open source GPT model via Groq, fast inference',
    },
  ],
}

/**
 * All available AI providers
 */
export const AI_PROVIDERS: AIProviderConfig[] = [ollamaProvider, openrouterProvider]

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(providerId: AIProviderType): AIProviderConfig | undefined {
  return AI_PROVIDERS.find(p => p.id === providerId)
}

/**
 * Get model configuration for a provider
 */
export function getModelConfig(
  providerId: AIProviderType,
  modelId: string
): AIModelConfig | undefined {
  const provider = getProviderConfig(providerId)
  return provider?.models.find(m => m.id === modelId)
}

/**
 * Get default provider (Ollama for local development)
 */
export function getDefaultProvider(): AIProviderConfig {
  return ollamaProvider
}

/**
 * Get recommended model for a provider
 */
export function getRecommendedModel(providerId: AIProviderType): AIModelConfig | undefined {
  const provider = getProviderConfig(providerId)
  return provider?.models.find(m => m.recommended) || provider?.models[0]
}
