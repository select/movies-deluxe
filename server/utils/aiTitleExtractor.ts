/**
 * AI Title Extractor - OpenCode SDK Implementation
 * Migrated from scripts/utils/aiTitleExtractor.ts
 *
 * Extracts clean movie titles from promotional text using OpenCode SDK.
 * Uses local OpenCode server with Claude 3.5 Sonnet model.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROMPT_FILE = resolve(process.cwd(), 'prompts/extract-movie-title.md')

/**
 * Minimal OpenCode client interface for type safety
 */
export interface OpenCodeClient {
  session: {
    prompt: (params: {
      path: { id: string }
      body: {
        model: { providerID: string; modelID: string }
        parts: Array<{ type: string; text: string }>
      }
    }) => Promise<{
      data: {
        parts: Array<{ type: string; text?: string }>
      }
    }>
  }
}

/**
 * Load prompt template from prompts directory
 */
export async function loadPrompt(): Promise<string> {
  try {
    return await readFile(PROMPT_FILE, 'utf-8')
  } catch (error) {
    throw new Error(`Failed to load prompt template from ${PROMPT_FILE}: ${error}`)
  }
}

/**
 * Calculate confidence score based on extracted title quality
 */
function calculateConfidence(
  extractedTitle: string,
  originalTitle: string
): 'high' | 'medium' | 'low' {
  // LOW confidence indicators
  if (extractedTitle.length < 2) return 'low' // Too short
  if (extractedTitle.length > 100) return 'low' // Too long
  if (/free|full|movie|hd|720p|1080p/i.test(extractedTitle)) return 'low' // Promotional text
  if (extractedTitle.toLowerCase() === originalTitle.toLowerCase()) return 'low' // Unchanged

  // MEDIUM confidence indicators
  if (/[|<>{}[\]]/.test(extractedTitle)) return 'medium' // Formatting artifacts
  if (extractedTitle.includes('  ')) return 'medium' // Double spaces

  // HIGH confidence: clean title
  return 'high'
}

/**
 * Extract single movie title using OpenCode SDK
 */
export async function extractTitle(
  client: OpenCodeClient,
  sessionId: string,
  promptTemplate: string,
  originalTitle: string
): Promise<{
  extractedTitle: string
  confidence: 'high' | 'medium' | 'low'
  model: string
  providerID: string
}> {
  // Replace placeholder in prompt template
  const prompt = promptTemplate.replace('{title}', originalTitle)

  try {
    // Send prompt to OpenCode session
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
        parts: [{ type: 'text', text: prompt }],
      },
    })

    // Extract text from response parts
    // The response contains an array of parts, we need to find text parts
    const textParts = result.data.parts.filter((part: { type: string }) => part.type === 'text')
    const extractedTitle = textParts
      .map((part: { text: string }) => part.text)
      .join('')
      .trim()

    if (!extractedTitle) {
      throw new Error('No title extracted from AI response')
    }

    // Calculate confidence
    const confidence = calculateConfidence(extractedTitle, originalTitle)

    return {
      extractedTitle,
      confidence,
      model: 'claude-3-5-sonnet-20241022',
      providerID: 'anthropic',
    }
  } catch (error) {
    throw new Error(`AI extraction failed for "${originalTitle}": ${error}`)
  }
}

/**
 * Batch extract titles with delay between requests
 */
export async function batchExtractTitles(
  client: OpenCodeClient,
  sessionId: string,
  promptTemplate: string,
  titles: Array<{ id: string; title: string }>,
  options?: {
    delayMs?: number
    onProgress?: (current: number, total: number, title: string) => void
  }
): Promise<
  Array<{
    id: string
    originalTitle: string
    extractedTitle: string
    confidence: 'high' | 'medium' | 'low'
    model: string
    providerID: string
    error?: string
  }>
> {
  const delayMs = options?.delayMs ?? 100
  const results: Array<{
    id: string
    originalTitle: string
    extractedTitle: string
    confidence: 'high' | 'medium' | 'low'
    model: string
    providerID: string
    error?: string
  }> = []

  for (let i = 0; i < titles.length; i++) {
    const { id, title } = titles[i]

    // Progress callback
    if (options?.onProgress) {
      options.onProgress(i + 1, titles.length, title)
    }

    try {
      const result = await extractTitle(client, sessionId, promptTemplate, title)

      results.push({
        id,
        originalTitle: title,
        ...result,
      })

      // Rate limiting: delay between requests
      if (i < titles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    } catch (error) {
      results.push({
        id,
        originalTitle: title,
        extractedTitle: '',
        confidence: 'low',
        model: 'claude-3-5-sonnet-20241022',
        providerID: 'anthropic',
        error: String(error),
      })
    }
  }

  return results
}
