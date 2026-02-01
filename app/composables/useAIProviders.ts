/**
 * AI Provider Configuration Composable
 *
 * Provides access to AI provider and model configurations.
 */

import type { AIProviderConfig, AIProviderType, AIModelConfig } from '~/types/ai-providers'

/**
 * Ollama provider configuration
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

const AI_PROVIDERS: AIProviderConfig[] = [ollamaProvider, openrouterProvider]

export function useAIProviders() {
  const providers = AI_PROVIDERS

  const getProviderConfig = (providerId: AIProviderType): AIProviderConfig | undefined => {
    return providers.find(p => p.id === providerId)
  }

  const getModelConfig = (
    providerId: AIProviderType,
    modelId: string
  ): AIModelConfig | undefined => {
    const provider = getProviderConfig(providerId)
    return provider?.models.find(m => m.id === modelId)
  }

  const getDefaultProvider = (): AIProviderConfig => {
    return ollamaProvider
  }

  const getRecommendedModel = (providerId: AIProviderType): AIModelConfig | undefined => {
    const provider = getProviderConfig(providerId)
    return provider?.models.find(m => m.recommended) || provider?.models[0]
  }

  return {
    providers,
    getProviderConfig,
    getModelConfig,
    getDefaultProvider,
    getRecommendedModel,
  }
}
