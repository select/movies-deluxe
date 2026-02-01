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
 * Cloud AI models - requires API key, pay-per-use
 */
const openrouterProvider: AIProviderConfig = {
  id: 'openrouter',
  name: 'OpenRouter',
  description: 'Cloud AI models - requires API key, pay-per-use',
  requiresApiKey: true,
  envVar: 'OPENROUTER_API_KEY',
  defaultModel: 'openai/gpt-4o-mini',
  models: [
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Best value - fast, accurate, very affordable',
      costPerMillion: 0.15, // $0.15 per million input tokens
      recommended: true,
    },
    {
      id: 'anthropic/claude-3-haiku',
      name: 'Claude 3 Haiku',
      description: 'Fast and efficient, good for structured extraction',
      costPerMillion: 0.25,
    },
    {
      id: 'google/gemini-flash-1.5',
      name: 'Gemini Flash 1.5',
      description: 'Very fast, good for batch operations',
      costPerMillion: 0.075,
    },
    {
      id: 'meta-llama/llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B',
      description: 'Open source, cost-effective',
      costPerMillion: 0.055,
    },
    {
      id: 'mistralai/mistral-7b-instruct',
      name: 'Mistral 7B Instruct',
      description: 'Efficient open source model',
      costPerMillion: 0.055,
    },
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      description: 'Highest quality, more expensive',
      costPerMillion: 2.5,
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      description: 'Excellent reasoning, higher cost',
      costPerMillion: 3.0,
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
