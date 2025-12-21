/**
 * Title Cleaning Utility
 *
 * YouTube channels add promotional text to video titles. This utility provides
 * channel-specific regex patterns to extract clean movie titles for better OMDB matching.
 *
 * @see config/dirty-clean-examples.txt for test cases
 */

export interface TitleCleaningPattern {
  regex: RegExp
  replacement?: string
  extractor?: (match: RegExpMatchArray) => string | null
  description: string
}

export interface TitleCleaningRule {
  channelId: string
  channelName: string
  patterns: TitleCleaningPattern[]
  examples: Array<{ dirty: string; clean: string }>
}

/**
 * Title cleaning rules for each YouTube channel
 */
export const TITLE_CLEANING_RULES: TitleCleaningRule[] = [
  {
    channelId: '@Netzkino',
    channelName: 'Netzkino',
    patterns: [
      {
        regex:
          /\s*\([^)]*(?:full movie|comedy|drama|film|classic|ganzer film|romantic|family|animal)[^)]*\)\s*$/i,
        replacement: '',
        description: 'Remove promotional text in parentheses at end',
      },
    ],
    examples: [
      {
        dirty:
          'Golden Winter 2 (Christmas comedy full movie in German, family movies, animal comedies)',
        clean: 'Golden Winter 2',
      },
      {
        dirty:
          'One of a Kind (STAR-STARRED COMEDY full movie in German, Romantic Comedy, Film Classic)',
        clean: 'One of a Kind',
      },
    ],
  },
  {
    channelId: '@FilmRiseMovies',
    channelName: 'FilmRise Movies',
    patterns: [
      {
        regex: /\s*\|\s*(?:Free Full|Part \d+ of \d+).*$/i,
        replacement: '',
        description: 'Remove branding and part indicators after pipe',
      },
    ],
    examples: [
      {
        dirty: 'A Christmas Karen | Free Full Holiday Movie | FilmRise Movies',
        clean: 'A Christmas Karen',
      },
      {
        dirty: "Steve Martini's The Judge | Part 1 of 2",
        clean: "Steve Martini's The Judge",
      },
    ],
  },
  {
    channelId: '@Popcornflix',
    channelName: 'Popcornflix',
    patterns: [
      {
        regex: /\s*(?:\(\d{4}\))?\s*\|\s*(?:Part \d+ of \d+\s*\|)?\s*FULL MOVIE.*$/i,
        replacement: '',
        description: 'Remove year, part indicators, FULL MOVIE, and genre info',
      },
    ],
    examples: [
      {
        dirty: 'Jason & the Argonauts | Part 1 of 2 | FULL MOVIE | Epic Adventure, Myth',
        clean: 'Jason & the Argonauts',
      },
      {
        dirty: 'Banger (2018) | FULL MOVIE | Action, Crime | Omar Gooding',
        clean: 'Banger',
      },
    ],
  },
  {
    channelId: '@MovieCentral',
    channelName: 'Movie Central',
    patterns: [
      {
        regex: /^[^|]+\|\s*([^|]+?)(?:\s*\|\s*(?:HD|20\d{2}).*)?$/,
        extractor: match => match[1]?.trim() || null,
        description: 'Extract alternate title (second part between pipes)',
      },
      {
        regex: /\s*\|\s*(?:HD|20\d{2}).*$/i,
        replacement: '',
        description: 'Fallback: remove HD/year patterns',
      },
    ],
    examples: [
      {
        dirty: 'Surviving The Club Underworld | Young Lion of the West',
        clean: 'Young Lion of the West',
      },
      {
        dirty: 'When Exes Crash The Holidays | Christmas With Da Fam | HD 2025 Christmas Movie',
        clean: 'Christmas With Da Fam',
      },
    ],
  },
  {
    channelId: '@TimelessClassicMovies',
    channelName: 'Timeless Classic Movies',
    patterns: [
      {
        regex: /\s*\[[^\]]+\]\s*/g,
        replacement: '',
        description: 'Remove all [Genre] tags',
      },
    ],
    examples: [
      {
        dirty: "Johnny O'Clock [Film Noir] [Drama] [Crime]",
        clean: "Johnny O'Clock",
      },
      {
        dirty: 'Vampire over London [Comedy] [Horror]',
        clean: 'Vampire over London',
      },
    ],
  },
  {
    channelId: '@Mosfilm',
    channelName: 'Mosfilm',
    patterns: [
      {
        regex: /\s*\|\s*[A-Za-z]+(?:\s*\|.*)?$/,
        replacement: '',
        description: 'Remove genre and subtitle info after pipe',
      },
    ],
    examples: [
      {
        dirty: 'Operacion "Y" | COMEDIA | Subtítulos en español',
        clean: 'Operacion "Y"',
      },
      {
        dirty: 'COUNTERMOVE | Action',
        clean: 'COUNTERMOVE',
      },
    ],
  },
  {
    channelId: '@Moviedome',
    channelName: 'Moviedome',
    patterns: [
      {
        regex: /.*:\s*([^(]+?)(?:\s*\(Ganzer Film.*)?$/,
        extractor: match => match[1]?.trim() || null,
        description: 'Extract title after colon, before (Ganzer Film)',
      },
      {
        regex: /\s*\(Ganzer Film[^)]*\)\s*$/i,
        replacement: '',
        description: 'Fallback: remove (Ganzer Film...) suffix',
      },
    ],
    examples: [
      {
        dirty: 'So ein toller Liebesfilm mit Starbesetzung: Testament of Youth (Ganzer Film)',
        clean: 'Testament of Youth',
      },
      {
        dirty:
          'Dieser Entführungsfilm mit RAY LIOTTA ist extrem spannend: THE ENTITLED (Ganzer Film bei Moviedome)',
        clean: 'THE ENTITLED',
      },
    ],
  },
]

/**
 * Clean a YouTube video title using channel-specific rules
 *
 * @param title - Raw video title from YouTube
 * @param channelId - YouTube channel ID (e.g., "@Netzkino")
 * @returns Cleaned movie title
 */
export function cleanTitle(title: string, channelId: string): string {
  const rule = TITLE_CLEANING_RULES.find(r => r.channelId === channelId)

  // No rule for this channel - return original title
  if (!rule) {
    return title.trim()
  }

  let cleanedTitle = title

  // Apply patterns sequentially
  for (const pattern of rule.patterns) {
    if (pattern.extractor) {
      // Extractor pattern - try to extract and stop if successful
      const match = cleanedTitle.match(pattern.regex)
      if (match) {
        const extracted = pattern.extractor(match)
        if (extracted) {
          cleanedTitle = extracted
          break // Stop after first successful extraction
        }
      }
    } else {
      // Replacement pattern - apply the replacement
      cleanedTitle = cleanedTitle.replace(pattern.regex, pattern.replacement || '')
    }
  }

  // Trim and return
  const result = cleanedTitle.trim()

  // If cleaning resulted in empty string, return original
  return result || title.trim()
}

/**
 * Test all title cleaning rules against their examples
 *
 * @returns Test results with pass/fail counts
 */
export function testCleaningRules(): {
  passed: number
  failed: number
  total: number
  results: Array<{
    channelName: string
    channelId: string
    dirty: string
    expected: string
    actual: string
    passed: boolean
  }>
} {
  const results: Array<{
    channelName: string
    channelId: string
    dirty: string
    expected: string
    actual: string
    passed: boolean
  }> = []

  let passed = 0
  let failed = 0

  console.log('\n🧪 Testing title cleaning rules...\n')

  for (const rule of TITLE_CLEANING_RULES) {
    console.log(`=== ${rule.channelName} (${rule.channelId}) ===`)

    for (const example of rule.examples) {
      const actual = cleanTitle(example.dirty, rule.channelId)
      const testPassed = actual === example.clean

      if (testPassed) {
        passed++
        console.log(
          `  ✓ PASS: "${example.dirty.substring(0, 50)}${example.dirty.length > 50 ? '...' : ''}"`
        )
        console.log(`    → "${actual}"`)
      } else {
        failed++
        console.log(
          `  ✗ FAIL: "${example.dirty.substring(0, 50)}${example.dirty.length > 50 ? '...' : ''}"`
        )
        console.log(`    Expected: "${example.clean}"`)
        console.log(`    Got:      "${actual}"`)
      }

      results.push({
        channelName: rule.channelName,
        channelId: rule.channelId,
        dirty: example.dirty,
        expected: example.clean,
        actual,
        passed: testPassed,
      })
    }

    console.log('')
  }

  const total = passed + failed

  console.log('=== Test Results ===')
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total:  ${total}`)
  console.log('')

  if (failed === 0) {
    console.log('✅ All tests passed!')
  } else {
    console.log(`❌ ${failed} test(s) failed`)
  }

  return { passed, failed, total, results }
}
