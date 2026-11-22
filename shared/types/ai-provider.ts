/**
 * AI Provider Abstraction Types
 *
 * Defines the interface for AI providers that extract movie metadata.
 * Supports multiple providers (Ollama, OpenRouter) through a unified interface.
 */

export type ExtractedContentType =
  'movie' | 'short' | 'tv_episode' | 'double_feature' | 'part' | 'clip' | 'unknown'

/**
 * Extracted movie metadata from AI
 */
export interface ExtractedMetadata {
  title?: string
  year?: number
  originalTitle?: string
  altTitles?: string[]
  director?: string
  cast?: string[]
  language?: string
  contentType?: ExtractedContentType
}

/**
 * Input for batch movie extraction
 */
export interface BatchMovieInput {
  id: string
  title: string
  description?: string
}

/**
 * Provider configuration base
 */
export interface ProviderConfig {
  model?: string
}

/**
 * Ollama-specific configuration
 */
export interface OllamaConfig extends ProviderConfig {
  host?: string
}

/**
 * OpenRouter-specific configuration
 */
export interface OpenRouterConfig extends ProviderConfig {
  apiKey?: string
  provider?: string // Provider slug (e.g., 'Groq')
}

/**
 * AI Provider interface
 * All providers must implement this interface
 */
export interface AIProvider {
  /**
   * Extract metadata for a single movie
   */
  extractMovieMetadata(
    title: string,
    description?: string,
    config?: ProviderConfig
  ): Promise<ExtractedMetadata | null>

  /**
   * Extract metadata for multiple movies in a single batch
   */
  extractMovieMetadataBatch(
    movies: BatchMovieInput[],
    config?: ProviderConfig
  ): Promise<Map<string, ExtractedMetadata>>

  /**
   * Check if the provider is available/configured
   */
  isAvailable(): Promise<boolean>
}

/**
 * Supported provider types
 */
export type ProviderType = 'ollama' | 'openrouter'
