/**
 * OpenRouter AI Integration Utilities
 *
 * Provides utilities for extracting movie metadata using OpenRouter API.
 * Compatible with OpenAI chat completions API format.
 */

import { loadPrompt, parseMetadataResponse, type ExtractedMetadata } from './ollama'

/**
 * OpenRouter API response structure (OpenAI-compatible)
 */
interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

/**
 * OpenRouter configuration
 */
interface OpenRouterConfig {
  apiKey: string
  model: string
}

/**
 * Default OpenRouter configuration
 */
const DEFAULT_CONFIG = {
  model: 'qwen/qwen3-32b',
  apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
}

/**
 * Get OpenRouter API key from environment
 *
 * @returns string | undefined - API key or undefined if not set
 */
export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY
}

/**
 * Check if OpenRouter is available (API key is set)
 *
 * @returns boolean - True if API key is configured
 */
export function isOpenRouterAvailable(): boolean {
  return !!getOpenRouterApiKey()
}

/**
 * Make OpenRouter chat request
 *
 * @param model - Model name to use (e.g., 'openai/gpt-4o-mini')
 * @param messages - Chat messages array
 * @param apiKey - OpenRouter API key
 * @returns Promise<OpenRouterResponse> - OpenRouter response
 */
export async function openrouterChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string
): Promise<OpenRouterResponse> {
  const response = await fetch(DEFAULT_CONFIG.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://movies-deluxe.local', // Required by OpenRouter
      'X-Title': 'Movies Deluxe', // Optional: app name for OpenRouter dashboard
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' }, // Request JSON response
      temperature: 0.1, // Low temperature for consistent extraction
      max_tokens: 256, // Metadata responses are small
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  return await response.json()
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
export async function extractMovieMetadata(
  title: string,
  description?: string,
  config: Partial<OpenRouterConfig> = {}
): Promise<ExtractedMetadata | null> {
  const apiKey = config.apiKey || getOpenRouterApiKey()
  const model = config.model || DEFAULT_CONFIG.model

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

    // Make AI request
    const response = await openrouterChat(model, [{ role: 'user', content: prompt }], apiKey)

    // Extract content from OpenAI-compatible response
    const content = response.choices?.[0]?.message?.content
    if (!content) {
      console.warn('Empty response from OpenRouter')
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
 *
 * @param apiKey - API key to validate
 * @returns Promise<boolean> - True if API key is valid
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    // Make a minimal request to check API key validity
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get available models from OpenRouter
 *
 * @param apiKey - OpenRouter API key
 * @returns Promise<string[]> - List of available model IDs
 */
export async function getAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as { data?: Array<{ id: string }> }
    return data.data?.map(m => m.id) || []
  } catch {
    return []
  }
}
