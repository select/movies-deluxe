/**
 * AI Provider Factory
 *
 * Creates AI provider instances based on provider type.
 * Centralizes provider instantiation and configuration.
 */

import type {
  AIProvider,
  ProviderType,
  OllamaConfig,
  OpenRouterConfig,
} from '../../shared/types/ai-provider'
import { createOllamaProvider } from './ollama'
import { createOpenRouterProvider } from './openrouter'

/**
 * Create an AI provider instance
 *
 * @param provider - Provider type ('ollama' | 'openrouter')
 * @param config - Provider-specific configuration
 * @returns AIProvider instance
 */
export function createAIProvider(provider: 'ollama', config?: OllamaConfig): AIProvider
export function createAIProvider(provider: 'openrouter', config?: OpenRouterConfig): AIProvider
export function createAIProvider(
  provider: ProviderType,
  config?: OllamaConfig | OpenRouterConfig
): AIProvider {
  switch (provider) {
    case 'ollama':
      return createOllamaProvider(config as OllamaConfig)
    case 'openrouter':
      return createOpenRouterProvider(config as OpenRouterConfig)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

/**
 * Get default provider based on availability
 * Prefers Ollama if available, falls back to OpenRouter
 *
 * @returns Promise<ProviderType> - Default provider type
 */
export async function getDefaultProvider(): Promise<ProviderType> {
  // Try Ollama first (local, no API key needed)
  const ollamaProvider = createAIProvider('ollama')
  if (await ollamaProvider.isAvailable()) {
    return 'ollama'
  }

  // Fall back to OpenRouter if configured
  const openRouterProvider = createAIProvider('openrouter')
  if (await openRouterProvider.isAvailable()) {
    return 'openrouter'
  }

  // Default to Ollama even if not available (for error messages)
  return 'ollama'
}
