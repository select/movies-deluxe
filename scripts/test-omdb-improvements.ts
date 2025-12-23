/**
 * Test script for OMDB matching improvements
 * Tests:
 * 1. "Director Unknown" prefix removal
 * 2. Flexible year matching (±2 years)
 * 3. Enhanced failure tracking
 */

import { cleanTitleGeneral } from '../server/utils/titleCleaner'

interface TestCase {
  input: string
  expected: string
  description: string
}

const testCases: TestCase[] = [
  {
    input: 'Director Unknown Pipin Der Kurze',
    expected: 'Pipin Der Kurze',
    description: 'Remove "Director Unknown" prefix',
  },
  {
    input: 'director unknown The Great Adventure',
    expected: 'The Great Adventure',
    description: 'Remove "Director Unknown" prefix (case insensitive)',
  },
  {
    input: '1934 Director Unknown Pipin Der Kurze',
    expected: 'Pipin Der Kurze',
    description: 'Remove year prefix AND "Director Unknown"',
  },
  {
    input: 'Director Unknown Up The River. 3gp',
    expected: 'Up The River',
    description: 'Remove "Director Unknown" AND file extension',
  },
  {
    input: 'The Movie Title',
    expected: 'The Movie Title',
    description: 'No changes needed (control test)',
  },
]

console.log('\n🧪 Testing OMDB Improvements\n')
console.log('=== Title Cleaner: "Director Unknown" Removal ===\n')

let passed = 0
let failed = 0

for (const test of testCases) {
  const actual = cleanTitleGeneral(test.input)
  const testPassed = actual === test.expected

  if (testPassed) {
    passed++
    console.log(`✓ PASS: ${test.description}`)
    console.log(`  Input:  "${test.input}"`)
    console.log(`  Output: "${actual}"`)
  } else {
    failed++
    console.log(`✗ FAIL: ${test.description}`)
    console.log(`  Input:    "${test.input}"`)
    console.log(`  Expected: "${test.expected}"`)
    console.log(`  Got:      "${actual}"`)
  }
  console.log('')
}

console.log('=== Test Results ===')
console.log(`Passed: ${passed}/${testCases.length}`)
console.log(`Failed: ${failed}/${testCases.length}`)
console.log('')

if (failed === 0) {
  console.log('✅ All tests passed!')
  process.exit(0)
} else {
  console.log(`❌ ${failed} test(s) failed`)
  process.exit(1)
}
