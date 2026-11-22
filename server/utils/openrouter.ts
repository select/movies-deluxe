/**
 * OpenRouter AI Integration Utilities
 *
 * Provides utilities for extracting movie metadata and structured JSON
 * responses using OpenRouter SDK.
 * Implements the AIProvider interface for abstraction.
 */

import { OpenRouter } from '@openrouter/sdk'
import { useRuntimeConfig } from 'nitropack/runtime'
import { loadPrompt, extractJsonFromResponse, extractJsonArrayFromResponse } from './ollama'
import type {
  AIProvider,
  OpenRouterConfig,
  ExtractedMetadata,
  ExtractedContentType,
  BatchMovieInput,
} from '../../shared/types/ai-provider'

/**
 * Default OpenRouter configuration
 */
const DEFAULT_CONFIG = {
  model: 'google/gemini-2.5-flash-lite',
}

const VALID_CONTENT_TYPES = new Set<ExtractedContentType>([
  'movie',
  'short',
  'tv_episode',
  'double_feature',
  'part',
  'clip',
  'unknown',
])

/**
 * Get OpenRouter API key from runtime config (with process.env fallback)
 */
export function getOpenRouterApiKey(): string | undefined {
  try {
    const config = useRuntimeConfig()
    if (config.openrouterApiKey) {
      return config.openrouterApiKey
    }
  } catch {
    // Outside Nitro runtime context
  }
  return process.env.OPENROUTER_API_KEY
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
    appTitle: 'Movies Deluxe',
  })
}

/**
 * Build chatRequest options, only including provider routing if explicitly requested
 */
function buildChatRequest(prompt: string, model: string, provider?: string) {
  return {
    model,
    messages: [{ role: 'user' as const, content: prompt }],
    ...(provider
      ? {
          provider: {
            only: [provider],
            allowFallbacks: false,
          },
        }
      : {}),
    stream: false as const,
  }
}

/**
 * Strip markdown code fences from LLM responses
 */
function stripCodeFences(content: string): string {
  const trimmed = content.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenceMatch?.[1] ? fenceMatch[1].trim() : trimmed
}

/**
 * Normalize and validate an ExtractedMetadata object (including extended fields)
 */
function normalizeExtractedItem(raw: Record<string, unknown>): ExtractedMetadata | null {
  if (!raw?.title || typeof raw.title !== 'string') {
    return null
  }

  const result: ExtractedMetadata = {
    title: raw.title.trim(),
  }

  if (raw.year !== undefined && raw.year !== null) {
    const year = Number(raw.year)
    const currentYear = new Date().getFullYear()
    if (!Number.isNaN(year) && year >= 1800 && year <= currentYear + 5) {
      result.year = year
    }
  }

  if (typeof raw.originalTitle === 'string' && raw.originalTitle.trim()) {
    result.originalTitle = raw.originalTitle.trim()
  }

  if (Array.isArray(raw.altTitles)) {
    const alts = raw.altTitles
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim())
    if (alts.length > 0) {
      result.altTitles = alts
    }
  }

  if (typeof raw.director === 'string' && raw.director.trim()) {
    result.director = raw.director.trim()
  }

  if (Array.isArray(raw.cast)) {
    const cast = raw.cast
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map(c => c.trim())
    if (cast.length > 0) {
      result.cast = cast
    }
  }

  if (typeof raw.language === 'string' && raw.language.trim()) {
    result.language = raw.language.trim()
  }

  if (
    typeof raw.contentType === 'string' &&
    VALID_CONTENT_TYPES.has(raw.contentType as ExtractedContentType)
  ) {
    result.contentType = raw.contentType as ExtractedContentType
  }

  return result
}

/**
 * Parse single metadata response from OpenRouter (supports extended fields)
 */
export function parseOpenRouterMetadataResponse(content: string): ExtractedMetadata | null {
  const cleaned = stripCodeFences(content)
  const jsonString = extractJsonFromResponse(cleaned)
  if (!jsonString) {
    console.warn('No JSON found in OpenRouter response')
    return null
  }

  try {
    const extracted = JSON.parse(jsonString) as Record<string, unknown>
    const normalized = normalizeExtractedItem(extracted)
    if (!normalized) {
      console.warn('Invalid metadata structure: missing or invalid title')
      return null
    }
    return normalized
  } catch (error) {
    console.error('Error parsing JSON from OpenRouter response:', error)
    return null
  }
}

/**
 * Parse batch metadata response from OpenRouter (supports extended fields)
 */
export function parseOpenRouterBatchMetadataResponse(
  content: string
): Array<ExtractedMetadata & { id: string }> {
  const cleaned = stripCodeFences(content)
  const jsonString = extractJsonArrayFromResponse(cleaned)
  if (!jsonString) {
    console.warn('No JSON array found in OpenRouter batch response')
    return []
  }

  try {
    const extracted = JSON.parse(jsonString)
    if (!Array.isArray(extracted)) {
      console.warn('OpenRouter batch response is not an array')
      return []
    }

    const results: Array<ExtractedMetadata & { id: string }> = []
    for (const item of extracted) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      if (!record.id || typeof record.id !== 'string') {
        console.warn('Batch item missing id, skipping')
        continue
      }
      const normalized = normalizeExtractedItem(record)
      if (!normalized) {
        console.warn(`Batch item ${record.id} missing title, skipping`)
        continue
      }
      results.push({ id: record.id, ...normalized })
    }

    return results
  } catch (error) {
    console.error('Error parsing JSON array from OpenRouter batch response:', error)
    return []
  }
}

/**
 * Reusable helper for sending a prompt to OpenRouter and parsing a JSON response
 */
export async function chatJsonOpenRouter<T>(
  prompt: string,
  config: OpenRouterConfig = {}
): Promise<T | null> {
  const apiKey = config.apiKey || getOpenRouterApiKey()
  const model = config.model || DEFAULT_CONFIG.model
  const provider = config.provider

  if (!apiKey) {
    console.warn('OpenRouter API key not configured (OPENROUTER_API_KEY)')
    return null
  }

  try {
    const client = createClient(apiKey)
    const completion = await client.chat.send({
      chatRequest: buildChatRequest(prompt, model, provider),
    })

    const rawContent = completion.choices?.[0]?.message?.content
    const content = typeof rawContent === 'string' ? rawContent : null
    if (!content) {
      console.warn('Empty or non-string response from OpenRouter')
      return null
    }

    const cleaned = stripCodeFences(content)
    const jsonString = cleaned.startsWith('[')
      ? extractJsonArrayFromResponse(cleaned)
      : extractJsonFromResponse(cleaned) || extractJsonArrayFromResponse(cleaned)

    if (!jsonString) {
      console.warn('No JSON found in OpenRouter JSON response')
      return null
    }

    return JSON.parse(jsonString) as T
  } catch (error) {
    console.error('Error in chatJsonOpenRouter:', error)
    return null
  }
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
  const provider = config.provider

  if (!apiKey) {
    console.warn('OpenRouter API key not configured (OPENROUTER_API_KEY)')
    return null
  }

  try {
    const promptTemplate = await loadPrompt('extract-movie-metadata')
    const prompt = promptTemplate
      .replace('{title}', title)
      .replace('{description}', description || 'No description available')

    const client = createClient(apiKey)
    const completion = await client.chat.send({
      chatRequest: buildChatRequest(prompt, model, provider),
    })

    const rawContent = completion.choices?.[0]?.message?.content
    const content = typeof rawContent === 'string' ? rawContent : null
    if (!content) {
      console.warn('Empty or non-string response from OpenRouter')
      return null
    }

    return parseOpenRouterMetadataResponse(content)
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
    await client.models.list()
    return true
  } catch {
    return false
  }
}

/**
 * Extract movie metadata for multiple movies in a single AI call via OpenRouter
 *
 * @param movies - Array of movies to process
 * @param config - Optional OpenRouter configuration override
 * @returns Promise<Map<string, ExtractedMetadata>> - Map of id to extracted metadata
 */
export async function extractMovieMetadataBatchOpenRouter(
  movies: BatchMovieInput[],
  config: OpenRouterConfig = {}
): Promise<Map<string, ExtractedMetadata>> {
  const apiKey = config.apiKey || getOpenRouterApiKey()
  const model = config.model || DEFAULT_CONFIG.model
  const provider = config.provider
  const results = new Map<string, ExtractedMetadata>()

  if (movies.length === 0) {
    return results
  }

  if (!apiKey) {
    console.warn('OpenRouter API key not configured (OPENROUTER_API_KEY)')
    return results
  }

  try {
    const promptTemplate = await loadPrompt('extract-movie-metadata-batch')
    const moviesJson = JSON.stringify(
      movies.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description || '',
      })),
      null,
      2
    )

    const prompt = promptTemplate.replace('{movies}', moviesJson)

    const client = createClient(apiKey)
    const completion = await client.chat.send({
      chatRequest: buildChatRequest(prompt, model, provider),
    })

    const rawContent = completion.choices?.[0]?.message?.content
    const content = typeof rawContent === 'string' ? rawContent : null
    if (!content) {
      console.warn('Empty or non-string response from OpenRouter batch')
      return results
    }

    const extracted = parseOpenRouterBatchMetadataResponse(content)
    for (const item of extracted) {
      const { id, ...metadata } = item
      results.set(id, metadata)
    }

    return results
  } catch (error) {
    console.error('Error in batch metadata extraction via OpenRouter:', error)
    return results
  }
}

/**
 * Get available models from OpenRouter
 */
export async function getAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const client = createClient(apiKey)
    const response = await client.models.list()
    const models: string[] = []
    for await (const page of response) {
      for (const m of page.result.data ?? []) {
        if (typeof m.id === 'string') {
          models.push(m.id)
        }
      }
    }
    return models
  } catch {
    return []
  }
}

/**
 * OpenRouter Provider Implementation
 * Implements AIProvider interface for OpenRouter
 */
export class OpenRouterProvider implements AIProvider {
  private apiKey?: string
  private model: string
  private provider?: string

  constructor(config: OpenRouterConfig = {}) {
    this.apiKey = config.apiKey || getOpenRouterApiKey()
    this.model = config.model || DEFAULT_CONFIG.model
    this.provider = config.provider
  }

  async isAvailable(): Promise<boolean> {
    return isOpenRouterAvailable() && !!this.apiKey
  }

  async extractMovieMetadata(
    title: string,
    description?: string,
    config?: OpenRouterConfig
  ): Promise<ExtractedMetadata | null> {
    const mergedConfig: OpenRouterConfig = {
      apiKey: this.apiKey,
      model: config?.model || this.model,
      provider: config?.provider ?? this.provider,
    }
    return await extractMovieMetadataOpenRouter(title, description, mergedConfig)
  }

  async extractMovieMetadataBatch(
    movies: BatchMovieInput[],
    config?: OpenRouterConfig
  ): Promise<Map<string, ExtractedMetadata>> {
    const mergedConfig: OpenRouterConfig = {
      apiKey: this.apiKey,
      model: config?.model || this.model,
      provider: config?.provider ?? this.provider,
    }
    return await extractMovieMetadataBatchOpenRouter(movies, mergedConfig)
  }
}

/**
 * Create a default OpenRouter provider instance
 */
export function createOpenRouterProvider(config?: OpenRouterConfig): AIProvider {
  return new OpenRouterProvider(config)
}
