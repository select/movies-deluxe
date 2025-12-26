/**
 * Test script for verifying the "- " prefix removal in cleanTitleGeneral
 *
 * This test ensures that the leading "- " prefix is removed correctly,
 * even when it's exposed after removing year prefixes.
 *
 * Related issue: movies-deluxe-djbd
 */

import { cleanTitleGeneral } from '../server/utils/titleCleaner'

interface TestCase {
  input: string
  expected: string
  description: string
}

const testCases: TestCase[] = [
  {
    input: '- Damals zu Hause',
    expected: 'Damals zu Hause',
    description: 'Simple leading dash prefix',
  },
  {
    input: '1937 - Damals zu Hause - Elbing - Land an der Weichsel (10m 55s, 352x240)',
    expected: 'Damals zu Hause',
    description: 'Year prefix followed by dash prefix (subtitle removed)',
  },
  {
    input: '- Sleep My Love',
    expected: 'Sleep My Love',
    description: 'Another simple dash prefix',
  },
  {
    input: '1948 - So Evil My Love - Lewis Allen - VO',
    expected: 'So Evil My Love - Lewis Allen - VO',
    description: 'Year prefix with dash prefix and additional content',
  },
  {
    input: '2020 - The Great Movie',
    expected: 'The Great Movie',
    description: 'Modern year (20xx) with dash prefix',
  },
  {
    input: '- Les Rapaces (Greed) - De Erich Von Stroheim',
    expected: 'Les Rapaces (Greed) - De Erich Von Stroheim',
    description: 'Dash prefix with foreign title',
  },
]

function runTests() {
  console.log('🧪 Testing cleanTitleGeneral for "- " prefix removal\n')

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    const result = cleanTitleGeneral(testCase.input)
    const success = result === testCase.expected

    if (success) {
      passed++
      console.log(`✅ PASS: ${testCase.description}`)
      console.log(`   Input:    "${testCase.input}"`)
      console.log(`   Output:   "${result}"`)
    } else {
      failed++
      console.log(`❌ FAIL: ${testCase.description}`)
      console.log(`   Input:    "${testCase.input}"`)
      console.log(`   Expected: "${testCase.expected}"`)
      console.log(`   Got:      "${result}"`)
    }
    console.log()
  }

  console.log('=== Test Results ===')
  console.log(`Passed: ${passed}/${testCases.length}`)
  console.log(`Failed: ${failed}/${testCases.length}`)

  if (failed === 0) {
    console.log('\n✅ All tests passed!')
    process.exit(0)
  } else {
    console.log(`\n❌ ${failed} test(s) failed`)
    process.exit(1)
  }
}

runTests()
