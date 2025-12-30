/**
 * Ollama AI Integration Utilities
 *
 * Provides utilities for extracting movie metadata using Ollama AI (gemma3:4b model).
 * Reuses patterns from scripts/ollama-augment.ts for consistency.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Ollama API response structure
 */
interface OllamaResponse {
  message: {
    content: string
  }
}

/**
 * Ollama configuration
 */
interface OllamaConfig {
  host: string
  model: string
}

/**
 * Extracted movie metadata from AI
 */
export interface ExtractedMetadata {
  title?: string
  year?: number
}

/**
 * Default Ollama configuration
 */
const DEFAULT_CONFIG: OllamaConfig = {
  host: 'http://localhost:11434',
  model: 'gemma3:4b',
}

/**
 * Check if Ollama model is available
 *
 * @param model - Model name to check (default: gemma3:4b)
 * @param host - Ollama host URL (default: http://localhost:11434)
 * @returns Promise<boolean> - True if model is available
 */
export async function isOllamaModelAvailable(
  model = DEFAULT_CONFIG.model,
  host = DEFAULT_CONFIG.host
): Promise<boolean> {
  try {
    const response = await fetch(`${host}/api/tags`)
    if (!response.ok) return false

    const data = await response.json()
    return data.models?.some((m: any) => m.name.includes(model)) ?? false
  } catch {
    return false
  }
}

/**
 * Make Ollama chat request
 *
 * @param model - Model name to use
 * @param messages - Chat messages array
 * @param host - Ollama host URL
 * @returns Promise<OllamaResponse> - Ollama response
 */
export async function ollamaChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  host = DEFAULT_CONFIG.host
): Promise<OllamaResponse> {
  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: 'json',
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

/**
 * Load prompt template from prompts/ directory
 *
 * @param promptName - Name of the prompt file (without .md extension)
 * @returns Promise<string> - Prompt template content
 */
export async function loadPrompt(promptName: string): Promise<string> {
  try {
    const promptPath = join(process.cwd(), 'prompts', `${promptName}.md`)
    return await readFile(promptPath, 'utf-8')
  } catch (error) {
    throw new Error(`Failed to load prompt "${promptName}": ${(error as Error).message}`)
  }
}

/**
 * Extract JSON from response content
 * Handles cases where AI includes extra text around JSON
 *
 * @param content - Response content from AI
 * @returns string | null - Extracted JSON string or null if not found
 */
export function extractJsonFromResponse(content: string): string | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  return jsonMatch?.[0] ?? null
}

/**
 * Parse metadata response from AI
 * Validates structure and year range
 *
 * @param content - Response content from AI
 * @returns ExtractedMetadata | null - Parsed metadata or null if invalid
 */
export function parseMetadataResponse(content: string): ExtractedMetadata | null {
  const jsonString = extractJsonFromResponse(content.trim())
  if (!jsonString) {
    console.warn('No JSON found in Ollama response')
    return null
  }

  try {
    const extracted = JSON.parse(jsonString)

    // Validate structure
    if (!extracted?.title || typeof extracted.title !== 'string') {
      console.warn('Invalid metadata structure: missing or invalid title')
      return null
    }

    // Validate year if present
    if (extracted.year !== undefined) {
      const year = Number(extracted.year)
      const currentYear = new Date().getFullYear()

      // Year must be between 1800 and current year + 5
      if (Number.isNaN(year) || year < 1800 || year > currentYear + 5) {
        console.warn(`Invalid year: ${extracted.year}`)
        return {
          title: extracted.title.trim(),
        }
      }

      return {
        title: extracted.title.trim(),
        year,
      }
    }

    return {
      title: extracted.title.trim(),
    }
  } catch (error) {
    console.error('Error parsing JSON from Ollama response:', error)
    return null
  }
}

/**
 * Extract movie metadata using Ollama AI
 * Main entry point for AI extraction
 *
 * @param title - Raw movie title from source
 * @param description - Optional description from source
 * @param config - Optional Ollama configuration override
 * @returns Promise<ExtractedMetadata | null> - Extracted metadata or null if failed
 */
export async function extractMovieMetadata(
  title: string,
  description?: string,
  config: Partial<OllamaConfig> = {}
): Promise<ExtractedMetadata | null> {
  const { host, model } = { ...DEFAULT_CONFIG, ...config }

  try {
    // Check if model is available
    const modelAvailable = await isOllamaModelAvailable(model, host)
    if (!modelAvailable) {
      console.warn(`Ollama model ${model} not available`)
      return null
    }

    // Load prompt template
    const promptTemplate = await loadPrompt('extract-movie-metadata')

    // Replace placeholders in prompt
    const prompt = promptTemplate
      .replace('{title}', title)
      .replace('{description}', description || 'No description available')

    // Make AI request
    const response = await ollamaChat(model, [{ role: 'user', content: prompt }], host)

    // Parse and validate response
    const extracted = parseMetadataResponse(response.message.content)
    if (!extracted) {
      return null
    }

    return extracted
  } catch (error) {
    console.error(`Error extracting metadata for "${title}":`, error)
    return null
  }
}
