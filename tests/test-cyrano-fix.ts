#!/usr/bin/env tsx
/**
 * Test script to verify Cyrano de Bergerac year matching fix
 */

import { matchMovie } from './utils/omdbMatcher.ts'
import { createLogger } from './utils/logger.ts'

const logger = createLogger('CyranoTest')

async function testCyranoMatching() {
  const apiKey = process.env.NUXT_PUBLIC_OMDB_API_KEY || process.env.OMDB_API_KEY

  if (!apiKey) {
    logger.error('OMDB API key not found. Set NUXT_PUBLIC_OMDB_API_KEY or OMDB_API_KEY')
    process.exit(1)
  }

  logger.info('Testing Cyrano de Bergerac matching...')
  logger.info('Expected: Should match 1950 version (tt0042367), not 1990 version (tt0099334)')

  // Test with year 1950 (correct version)
  logger.info('\n=== Test 1: With year 1950 ===')
  const result1950 = await matchMovie('Cyrano de Bergerac', 1950, apiKey)
  logger.info(`Result: ${JSON.stringify(result1950, null, 2)}`)

  if (result1950.imdbId === 'tt0042367') {
    logger.success('✓ PASS: Correctly matched 1950 version!')
  } else if (result1950.imdbId === 'tt0099334') {
    logger.error('✗ FAIL: Incorrectly matched 1990 version')
  } else {
    logger.warn(`? UNKNOWN: Matched ${result1950.imdbId}`)
  }

  // Test without year (should still prefer first result)
  logger.info('\n=== Test 2: Without year ===')
  const resultNoYear = await matchMovie('Cyrano de Bergerac', undefined, apiKey)
  logger.info(`Result: ${JSON.stringify(resultNoYear, null, 2)}`)

  // Test with year 1990 (should match 1990 version)
  logger.info('\n=== Test 3: With year 1990 ===')
  const result1990 = await matchMovie('Cyrano de Bergerac', 1990, apiKey)
  logger.info(`Result: ${JSON.stringify(result1990, null, 2)}`)

  if (result1990.imdbId === 'tt0099334') {
    logger.success('✓ PASS: Correctly matched 1990 version!')
  } else {
    logger.warn(`? Matched ${result1990.imdbId} instead of tt0099334`)
  }

  logger.info('\n=== Summary ===')
  logger.info('The fix should ensure that when year is provided, it is used as a')
  logger.info('primary criterion for matching, preventing wrong versions from being matched.')
}

testCyranoMatching().catch(error => {
  logger.error('Test failed:', error)
  process.exit(1)
})
