#!/usr/bin/env tsx

const pattern =
  /\s*\([^)]*(?:full movie|comedy|drama|film|classic|ganzer film|romantic|family|animal)[^)]*\)\s*$/i

const test1 =
  'Dead Awake (FULL HORROR MOVIE in German, new horror movies 2025, full-length mystery thriller)'
const test2 = 'Dead Awake (full movie in German)'

console.log('Pattern:', pattern)
console.log()
console.log(`Test 1: "${test1}"`)
console.log(`  Contains "FULL HORROR MOVIE": ${test1.includes('FULL HORROR MOVIE')}`)
console.log(`  Contains "full movie": ${test1.toLowerCase().includes('full movie')}`)
console.log(`  Regex match: ${pattern.test(test1)}`)
console.log()
console.log(`Test 2: "${test2}"`)
console.log(`  Contains "full movie": ${test2.includes('full movie')}`)
console.log(`  Regex match: ${pattern.test(test2)}`)
