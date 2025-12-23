import { cleanTitleGeneral } from '../server/utils/titleCleaner'

const testCases = [
  {
    input: '1934 Pipin Der Kurze',
    expected: 'Pipin Der Kurze',
    description: 'Remove year prefix',
  },
  {
    input:
      'Heute Abend Bei Mir ( Jenny Jugo, Paul Hörbiger, Aribert Wäscher, Theo Lingen, Fritz Odemar)',
    expected: 'Heute Abend Bei Mir',
    description: 'Remove actor list in parentheses',
  },
  {
    input: '2001 A Space Odyssey',
    expected: 'A Space Odyssey',
    description: 'Remove year prefix from famous title',
  },
  {
    input: 'The Great Movie (John Doe, Jane Smith)',
    expected: 'The Great Movie',
    description: 'Remove actor list with two actors',
  },
  {
    input: '1999 The Matrix',
    expected: 'The Matrix',
    description: 'Remove year prefix with "The"',
  },
  {
    input: 'Director Unknown Up The River. 3gp',
    expected: 'Director Unknown Up The River',
    description: 'Remove file extension .3gp',
  },
  {
    input: 'Some Movie.mp4',
    expected: 'Some Movie',
    description: 'Remove file extension .mp4',
  },
  {
    input: 'Another Film.avi',
    expected: 'Another Film',
    description: 'Remove file extension .avi',
  },
]

console.log('\n🧪 Testing Title Cleaner Improvements\n')

let passed = 0
let failed = 0

for (const test of testCases) {
  const result = cleanTitleGeneral(test.input)
  const success = result === test.expected

  if (success) {
    passed++
    console.log(`✓ PASS: ${test.description}`)
    console.log(`  Input:    "${test.input}"`)
    console.log(`  Output:   "${result}"`)
  } else {
    failed++
    console.log(`✗ FAIL: ${test.description}`)
    console.log(`  Input:    "${test.input}"`)
    console.log(`  Expected: "${test.expected}"`)
    console.log(`  Got:      "${result}"`)
  }
  console.log('')
}

console.log(`\n=== Results ===`)
console.log(`Passed: ${passed}/${testCases.length}`)
console.log(`Failed: ${failed}/${testCases.length}`)

if (failed === 0) {
  console.log('✅ All tests passed!')
} else {
  console.log(`❌ ${failed} test(s) failed`)
  process.exit(1)
}
