/**
 * Test the general-purpose title cleaner against failed OMDB entries
 */

import { cleanTitleGeneral } from '../server/utils/titleCleaner'

interface TestCase {
  input: string
  expected: string
  description: string
}

const testCases: TestCase[] = [
  // Charlie Chaplin possessive + quotes
  {
    input: 'Charlie Chaplin\'s " The Pawnshop"',
    expected: 'The Pawnshop',
    description: 'Possessive with quotes',
  },
  {
    input: 'Charlie Chaplin\'s "The Count"',
    expected: 'The Count',
    description: 'Possessive with quotes',
  },
  {
    input: 'Charlie Chaplin\'s "A Burlesque On Carmen"',
    expected: 'A Burlesque On Carmen',
    description: 'Possessive with quotes',
  },

  // Foreign titles with English translation
  {
    input: 'Das Kabinett des Doktor Caligari ( The Cabinet of Dr. Caligari )',
    expected: 'The Cabinet of Dr. Caligari',
    description: 'Foreign title with English in parens',
  },
  {
    input: 'Bronenosets Potyomkin (Battleship Potemkin)',
    expected: 'Battleship Potemkin',
    description: 'Foreign title with English in parens',
  },
  {
    input: 'Nosferatu, eine Symphonie des Grauens (A Symphony of Horror)',
    expected: 'A Symphony of Horror',
    description: 'Foreign title with English in parens',
  },
  {
    input: 'Triumph of the Will (German: Triumph des Willens)',
    expected: 'Triumph of the Will',
    description: 'English title with foreign in parens',
  },

  // Actor promotional text
  {
    input: 'WOODY HARRELSON is THE SUNCHASER',
    expected: 'THE SUNCHASER',
    description: 'Actor is Title format',
  },
  {
    input: 'PAUL WALKER in JOYRIDE – SPRITZTOUR',
    expected: 'JOYRIDE – SPRITZTOUR',
    description: 'Actor in Title format',
  },
  {
    input: 'PIERCE BROSNAN is ROBINSON CRUSOE',
    expected: 'ROBINSON CRUSOE',
    description: 'Actor is Title format',
  },

  // Pipe-separated promotional text
  {
    input: 'Decision | WAR MOVIE',
    expected: 'Decision',
    description: 'Pipe with genre',
  },
  {
    input: 'Happy Christmas | ROMANTIC COMEDY',
    expected: 'Happy Christmas',
    description: 'Pipe with genre',
  },
  {
    input: 'Cosmos | SCIENCE FICTION',
    expected: 'Cosmos',
    description: 'Pipe with genre',
  },
  {
    input: 'The Sunchaser | WAR DRAMA',
    expected: 'The Sunchaser',
    description: 'Pipe with genre',
  },
  {
    input: 'Dreamland | Subtitulos en Español',
    expected: 'Dreamland',
    description: 'Pipe with subtitle info',
  },
  {
    input: 'The Contractor | Con subtítulos en español',
    expected: 'The Contractor',
    description: 'Pipe with subtitle info',
  },

  // Descriptive subtitles after dash
  {
    input: 'Snow-Covered Hearts - A Romantic Christmas Fairy Tale',
    expected: 'Snow-Covered Hearts',
    description: 'Dash with long descriptive subtitle',
  },
  {
    input: 'The Driftless Area - Nothing is as it seems',
    expected: 'The Driftless Area',
    description: 'Dash with descriptive subtitle',
  },
  {
    input: 'The Guard - An Irishman Sees Black!',
    expected: 'The Guard',
    description: 'Dash with descriptive subtitle',
  },
  {
    input: 'Faculty - Trust no teacher!',
    expected: 'Faculty',
    description: 'Dash with descriptive subtitle',
  },

  // Actor names with years
  {
    input: 'War of the Wildcats - John Wayne (1943)',
    expected: 'War of the Wildcats',
    description: 'Title with actor and year',
  },

  // Years in parentheses
  {
    input: 'DOUBLE FEATURE HELL 2 (the grindhouse experience).',
    expected: 'DOUBLE FEATURE HELL 2',
    description: 'Descriptive text in parens',
  },

  // Simple titles that should pass through
  {
    input: 'Horror Express',
    expected: 'Horror Express',
    description: 'Simple title (no cleaning needed)',
  },
  {
    input: 'Sex Madness',
    expected: 'Sex Madness',
    description: 'Simple title (no cleaning needed)',
  },
  {
    input: 'The House On Haunted Hill',
    expected: 'The House On Haunted Hill',
    description: 'Simple title (no cleaning needed)',
  },
]

console.log('\n🧪 Testing General Title Cleaner\n')
console.log('='.repeat(80))

let passed = 0
let failed = 0

testCases.forEach(({ input, expected, description }) => {
  const result = cleanTitleGeneral(input)
  const testPassed = result === expected

  if (testPassed) {
    passed++
    console.log(`✓ PASS: ${description}`)
    console.log(`  Input:  "${input}"`)
    console.log(`  Output: "${result}"`)
  } else {
    failed++
    console.log(`✗ FAIL: ${description}`)
    console.log(`  Input:    "${input}"`)
    console.log(`  Expected: "${expected}"`)
    console.log(`  Got:      "${result}"`)
  }
  console.log('')
})

console.log('='.repeat(80))
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)\n`)

if (failed === 0) {
  console.log('✅ All tests passed!\n')
  process.exit(0)
} else {
  console.log(`❌ ${failed} test(s) failed\n`)
  process.exit(1)
}
