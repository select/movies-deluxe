/**
 * OpenRouter AI Integration Utilities
 *
 * Provides utilities for extracting movie metadata using OpenRouter SDK.
 * Uses Groq as the preferred provider for fast inference.
 */

import { OpenRouter } from '@openrouter/sdk'
import { loadPrompt, parseMetadataResponse, type ExtractedMetadata } from './ollama'

/**
 * OpenRouter configuration
 */
interface OpenRouterConfig {
  apiKey?: string
  model?: string
  provider?: string // Provider slug (e.g., 'Groq')
}

/**
 * Default OpenRouter configuration
 */
const DEFAULT_CONFIG = {
  model: 'qwen/qwen3-32b',
  provider: 'Groq', // Use Groq for fast inference
}

/**
 * Get OpenRouter API key from runtime config
 */
export function getOpenRouterApiKey(): string | undefined {
  const config = useRuntimeConfig()
  return config.openrouterApiKey
}

/**
 * Check if OpenRouter is available (API key is set)
 */
export function isOpenRouterAvailable(): boolean {
  return !!getOpenRouterApiKey()
}

/**
 * Create OpenRouter client instance
 */
function createClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: 'https://movies-deluxe.local',
    xTitle: 'Movies Deluxe',
  })
}

/**
 * Extract movie metadata using OpenRouter AI
 * Main entry point for AI extraction via OpenRouter
 *
 * @param title - Raw movie title from source
 * @param description - Optional description from source
 * @param config - Optional OpenRouter configuration override
 * @returns Promise<ExtractedMetadata | null> - Extracted metadata or null if failed
 */
export async function extractMovieMetadataOpenRouter(
  title: string,
  description?: string,
  config: OpenRouterConfig = {}
): Promise<ExtractedMetadata | null> {
  const apiKey = config.apiKey || getOpenRouterApiKey()
  const model = config.model || DEFAULT_CONFIG.model
  const provider = config.provider || DEFAULT_CONFIG.provider

  if (!apiKey) {
    console.warn('OpenRouter API key not configured (OPENROUTER_API_KEY)')
    return null
  }

  try {
    // Load prompt template (reuse from ollama.ts)
    const promptTemplate = await loadPrompt('extract-movie-metadata')

    // Replace placeholders in prompt
    const prompt = promptTemplate
      .replace('{title}', title)
      .replace('{description}', description || 'No description available')

    // Create client and make request
    const client = createClient(apiKey)
    const completion = await client.chat.send({
      model,
      messages: [{ role: 'user', content: prompt }],
      provider: {
        only: [provider], // Route to specific provider (e.g., Groq)
        allowFallbacks: false,
      },
      stream: false,
    })

    // Extract content from response
    const rawContent = completion.choices?.[0]?.message?.content
    const content = typeof rawContent === 'string' ? rawContent : null
    if (!content) {
      console.warn('Empty or non-string response from OpenRouter')
      return null
    }

    // Parse and validate response (reuse from ollama.ts)
    const extracted = parseMetadataResponse(content)
    if (!extracted) {
      return null
    }

    return extracted
  } catch (error) {
    console.error(`Error extracting metadata for "${title}" via OpenRouter:`, error)
    return null
  }
}

/**
 * Validate OpenRouter API key by making a test request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const client = createClient(apiKey)
    // List models to verify API key
    await client.models.list()
    return true
  } catch {
    return false
  }
}

/**
 * Get available models from OpenRouter
 */
export async function getAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const client = createClient(apiKey)
    const response = await client.models.list()
    return response.data?.map(m => m.id).filter((id): id is string => typeof id === 'string') || []
  } catch {
    return []
  }
}
