#!/usr/bin/env node
/**
 * YouTube Data API v3 Setup & Test Script
 *
 * Run with: pnpm youtube:setup
 *
 * This script will guide you through:
 * 1. Setting up your API key
 * 2. Testing the API connection
 * 3. Fetching all video IDs from FilmRise Movies channel
 * 4. Verifying the implementation works correctly
 */

import { getChannelVideoIds, getChannelVideoCount } from '../server/utils/youtubeDataApi'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const CHANNEL_ID = 'UC8IHAQMuiJdY6ALuhG7iU8Q' // FilmRise Movies
const EXPECTED_VIDEOS = 446

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
  section: (msg: string) => console.log(`\n${colors.bright}${msg}${colors.reset}`),
  step: (num: number, msg: string) =>
    console.log(`\n${colors.bright}Step ${num}:${colors.reset} ${msg}`),
}

function printHeader() {
  console.clear()
  console.log(colors.cyan + '='.repeat(80) + colors.reset)
  console.log(colors.bright + '  YouTube Data API v3 - Interactive Test & Setup' + colors.reset)
  console.log(colors.cyan + '='.repeat(80) + colors.reset)
  console.log()
}

function printSeparator() {
  console.log(colors.cyan + '-'.repeat(80) + colors.reset)
}

async function checkApiKey(): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (apiKey && apiKey !== 'your_youtube_api_key_here') {
    log.success('API key found in environment')
    return apiKey
  }

  return null
}

async function promptForApiKey(rl: readline.Interface): Promise<string> {
  log.warning('No API key found in environment')
  console.log()
  console.log('To get a YouTube Data API key:')
  console.log('  1. Go to: https://console.cloud.google.com/apis/credentials')
  console.log('  2. Create a new project (or select existing)')
  console.log('  3. Enable "YouTube Data API v3"')
  console.log('  4. Create credentials → API Key')
  console.log('  5. Copy the key')
  console.log()

  const apiKey = await rl.question('Paste your YouTube API key here: ')
  return apiKey.trim()
}

async function testApiConnection(apiKey: string): Promise<boolean> {
  log.section('Testing API Connection')
  printSeparator()

  try {
    log.info('Attempting to fetch channel info...')
    const videoCount = await getChannelVideoCount(apiKey, CHANNEL_ID)

    if (videoCount > 0) {
      log.success(`API connection successful!`)
      log.info(`Channel has ${videoCount} videos`)
      return true
    } else {
      log.error('API returned 0 videos (unexpected)')
      return false
    }
  } catch (error: unknown) {
    log.error('API connection failed')
    console.log()

    if (error instanceof Error && error.message?.includes('API key')) {
      log.error('API Key Error:')
      console.log('  • Check that your API key is correct')
      console.log('  • Verify YouTube Data API v3 is enabled in your project')
      console.log('  • Check API key restrictions (should allow YouTube Data API)')
    } else if (error instanceof Error && error.message?.includes('quota')) {
      log.error('Quota Error:')
      console.log('  • Daily quota limit reached (10,000 units/day)')
      console.log('  • Wait until midnight Pacific Time for reset')
      console.log('  • Or request quota increase from Google')
    } else {
      log.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }

    return false
  }
}

async function fetchAllVideoIds(apiKey: string): Promise<string[]> {
  log.section('Fetching All Video IDs')
  printSeparator()

  log.info(`Channel: FilmRise Movies (${CHANNEL_ID})`)
  log.info(`Expected: ${EXPECTED_VIDEOS} videos`)
  console.log()

  const startTime = Date.now()

  try {
    const videoIds = await getChannelVideoIds(apiKey, CHANNEL_ID)
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log()
    log.success(`Fetched ${videoIds.length} video IDs in ${duration}s`)

    return videoIds
  } catch (error: unknown) {
    log.error(
      `Failed to fetch video IDs: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}

function analyzeResults(videoIds: string[]) {
  log.section('Results Analysis')
  printSeparator()

  const coverage = ((videoIds.length / EXPECTED_VIDEOS) * 100).toFixed(1)
  const missing = EXPECTED_VIDEOS - videoIds.length

  console.log(`Expected videos:  ${EXPECTED_VIDEOS}`)
  console.log(`Fetched videos:   ${videoIds.length}`)
  console.log(`Coverage:         ${coverage}%`)

  if (videoIds.length >= EXPECTED_VIDEOS) {
    console.log()
    log.success('SUCCESS: All videos fetched! 🎉')
  } else if (videoIds.length > 154) {
    console.log()
    log.warning(`Missing ${missing} videos, but better than before (154)`)
  } else {
    console.log()
    log.error(`Missing ${missing} videos`)
  }

  // Check for duplicates
  const uniqueIds = new Set(videoIds)
  const duplicates = videoIds.length - uniqueIds.size

  console.log()
  console.log(`Unique IDs:       ${uniqueIds.size}`)
  console.log(`Duplicates:       ${duplicates}`)

  if (duplicates > 0) {
    log.warning('Found duplicate video IDs!')
  }

  // Show sample IDs
  console.log()
  console.log('First 5 video IDs:')
  videoIds.slice(0, 5).forEach((id, i) => {
    console.log(`  ${i + 1}. ${id}`)
  })

  console.log()
  console.log('Last 5 video IDs:')
  videoIds.slice(-5).forEach((id, i) => {
    console.log(`  ${videoIds.length - 4 + i}. ${id}`)
  })
}

async function saveApiKeyInstructions(apiKey: string) {
  log.section('Next Steps')
  printSeparator()

  console.log('To use this API key permanently:')
  console.log()
  console.log('1. Create or edit .env file in project root:')
  console.log()
  console.log('   ' + colors.yellow + 'YOUTUBE_API_KEY=' + apiKey + colors.reset)
  console.log()
  console.log('2. Restart your dev server:')
  console.log()
  console.log('   ' + colors.cyan + 'pnpm dev' + colors.reset)
  console.log()
  console.log('3. Go to admin panel and run YouTube scraper:')
  console.log()
  console.log('   ' + colors.cyan + 'http://localhost:3003/admin' + colors.reset)
  console.log()
  console.log('4. The scraper will now fetch ALL videos from all channels!')
  console.log()
}

async function runInteractiveTest() {
  printHeader()

  const rl = readline.createInterface({ input, output })

  try {
    // Step 1: Check for API key
    log.step(1, 'Checking for API key')
    printSeparator()

    let apiKey = await checkApiKey()

    if (!apiKey) {
      apiKey = await promptForApiKey(rl)

      if (!apiKey) {
        log.error('No API key provided')
        process.exit(1)
      }
    }

    // Step 2: Test API connection
    log.step(2, 'Testing API connection')
    const connected = await testApiConnection(apiKey)

    if (!connected) {
      log.error('Cannot proceed without valid API connection')
      process.exit(1)
    }

    // Step 3: Fetch all video IDs
    log.step(3, 'Fetching all video IDs')
    const videoIds = await fetchAllVideoIds(apiKey)

    // Step 4: Analyze results
    log.step(4, 'Analyzing results')
    analyzeResults(videoIds)

    // Step 5: Show next steps
    log.step(5, 'Setup instructions')
    await saveApiKeyInstructions(apiKey)

    // Final summary
    console.log(colors.green + '='.repeat(80) + colors.reset)
    console.log(colors.bright + colors.green + '  ✓ Test completed successfully!' + colors.reset)
    console.log(colors.green + '='.repeat(80) + colors.reset)
    console.log()
  } catch (error: unknown) {
    console.log()
    log.error('Test failed: ' + (error instanceof Error ? error.message : String(error)))
    console.log()
    if (error instanceof Error) {
      console.log('Stack trace:')
      console.log(error.stack)
    }
    process.exit(1)
  } finally {
    rl.close()
  }
}

// Run the interactive test
runInteractiveTest().catch(console.error)
