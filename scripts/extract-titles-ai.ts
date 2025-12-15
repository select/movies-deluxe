#!/usr/bin/env tsx

/**
 * AI-Powered Movie Title Extraction Script
 *
 * Uses an LLM to extract clean movie titles from promotional YouTube/Archive.org titles.
 * Stores extracted titles in the ai.extractedTitle field for improved OMDB matching.
 *
 * Usage:
 *   pnpm extract-titles              # Process all movies without AI metadata
 *   pnpm extract-titles --dry-run    # Preview without saving
 *   pnpm extract-titles --force      # Reprocess all movies
 *   pnpm extract-titles --limit 10   # Process only 10 movies
 *
 * Requirements:
 *   - Add OPENAI_API_KEY to .env file
 *   - Install openai package: pnpm add openai
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import type { MovieEntry, MoviesDatabase, AIMetadata } from '../types/movie'
import { createLogger } from './utils/logger'

const logger = createLogger('extract-titles-ai')

// Load environment variables
config()

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const DATA_FILE = resolve(process.cwd(), 'data/movies.json')
const PROMPT_FILE = resolve(process.cwd(), 'prompts/extract-movie-title.md')

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isForce = args.includes('--force')
const limitIndex = args.indexOf('--limit')
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : undefined

/**
 * Load the prompt template from prompts directory
 */
function loadPromptTemplate(): string {
  try {
    return readFileSync(PROMPT_FILE, 'utf-8')
  } catch (error) {
    logger.error(`Failed to load prompt template from ${PROMPT_FILE}`)
    throw error
  }
}

/**
 * Extract movie title using OpenAI API
 */
async function extractTitleWithAI(title: string, promptTemplate: string): Promise<AIMetadata> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY not found in environment. Please add it to your .env file.\n' +
        'Get your API key from: https://platform.openai.com/api-keys'
    )
  }

  // Dynamic import to avoid requiring openai if not installed
  let OpenAI
  try {
    const openaiModule = await import('openai')
    OpenAI = openaiModule.default
  } catch {
    throw new Error(
      'OpenAI package not installed. Please run: pnpm add openai\n' +
        'Or use npm: npm install openai'
    )
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

  // Replace placeholder in prompt template
  const prompt = promptTemplate.replace('{title}', title)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cost-effective model
      messages: [
        {
          role: 'system',
          content:
            'You are a movie enthusiast who has seen most movies from the last 100 years. ' +
            'Your task is to extract clean movie titles from promotional text. ' +
            'Return ONLY the movie title, nothing else.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1, // Low temperature for consistent results
      max_tokens: 50, // Movie titles are short
    })

    const extractedTitle = response.choices[0]?.message?.content?.trim()

    if (!extractedTitle) {
      throw new Error('No title extracted from AI response')
    }

    return {
      extractedTitle,
      confidence: 0.9, // High confidence for GPT-4 responses
      timestamp: new Date().toISOString(),
      model: 'gpt-4o-mini',
      prompt: 'extract-movie-title.md',
    }
  } catch (error) {
    logger.error(`AI extraction failed for "${title}": ${error}`)
    throw error
  }
}

/**
 * Process movies and extract titles
 */
async function processMovies() {
  logger.info('Starting AI-powered title extraction...')

  // Load movies database
  let database: MoviesDatabase
  try {
    const data = readFileSync(DATA_FILE, 'utf-8')
    database = JSON.parse(data)
  } catch (error) {
    logger.error(`Failed to load movies database from ${DATA_FILE}`)
    throw error
  }

  // Load prompt template
  const promptTemplate = loadPromptTemplate()
  logger.info(`Loaded prompt template from ${PROMPT_FILE}`)

  // Filter movies that need processing
  const allMovies = Object.entries(database).filter(
    ([key]) => !key.startsWith('_') && key !== '_example'
  )

  const moviesToProcess = allMovies.filter(([_, movie]) => {
    const m = movie as MovieEntry
    return isForce || !m.ai?.extractedTitle
  })

  const totalMovies = allMovies.length
  const needsProcessing = moviesToProcess.length

  logger.info(
    `Found ${totalMovies} movies, ${needsProcessing} need AI title extraction` +
      (isForce ? ' (--force mode)' : '')
  )

  if (needsProcessing === 0) {
    logger.info('All movies already have AI-extracted titles. Use --force to reprocess.')
    return
  }

  // Apply limit if specified
  const toProcess = limit ? moviesToProcess.slice(0, limit) : moviesToProcess
  logger.info(
    `Processing ${toProcess.length} movies` +
      (limit ? ` (limited to ${limit})` : '') +
      (isDryRun ? ' (DRY RUN - no changes will be saved)' : '')
  )

  // Process each movie
  let successCount = 0
  let failureCount = 0
  const results: Array<{ imdbId: string; original: string; extracted: string }> = []

  for (let i = 0; i < toProcess.length; i++) {
    const [imdbId, movie] = toProcess[i]
    const m = movie as MovieEntry

    logger.info(`[${i + 1}/${toProcess.length}] Processing: ${m.title}`)

    try {
      const aiMetadata = await extractTitleWithAI(m.title, promptTemplate)

      // Update movie entry
      if (!isDryRun) {
        m.ai = aiMetadata
        m.lastUpdated = new Date().toISOString()
      }

      results.push({
        imdbId,
        original: m.title,
        extracted: aiMetadata.extractedTitle || '',
      })

      logger.success(`  ✓ Extracted: "${aiMetadata.extractedTitle}"`)
      successCount++

      // Rate limiting: wait 100ms between requests to avoid hitting API limits
      if (i < toProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      logger.error(`  ✗ Failed: ${error}`)
      failureCount++
    }
  }

  // Save updated database
  if (!isDryRun && successCount > 0) {
    try {
      writeFileSync(DATA_FILE, JSON.stringify(database, null, 2) + '\n', 'utf-8')
      logger.success(`Saved ${successCount} updated entries to ${DATA_FILE}`)
    } catch (error) {
      logger.error(`Failed to save database: ${error}`)
      throw error
    }
  }

  // Print summary
  logger.info('\n=== Extraction Summary ===')
  logger.info(`Total processed: ${toProcess.length}`)
  logger.info(`Successful: ${successCount}`)
  logger.info(`Failed: ${failureCount}`)

  if (isDryRun) {
    logger.info('\nDRY RUN - No changes were saved')
  }

  // Print sample results
  if (results.length > 0) {
    logger.info('\n=== Sample Results ===')
    results.slice(0, 10).forEach(result => {
      logger.info(`${result.imdbId}:`)
      logger.info(`  Original:  "${result.original}"`)
      logger.info(`  Extracted: "${result.extracted}"`)
    })

    if (results.length > 10) {
      logger.info(`\n... and ${results.length - 10} more`)
    }
  }
}

// Run the script
processMovies().catch(error => {
  logger.error(`Script failed: ${error}`)
  process.exit(1)
})
