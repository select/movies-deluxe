/**
 * Title Cleaning Utility
 * Migrated from scripts/utils/titleCleaner.ts
 *
 * This utility provides two types of title cleaning:
 * 1. Channel-specific cleaning for YouTube titles (cleanTitle)
 * 2. General-purpose cleaning for Archive.org and other sources (cleanTitleGeneral)
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
        regex: /^Watch\s+/i,
        replacement: '',
        description: 'Remove "Watch" prefix',
      },
      {
        regex:
          /\s*\([^)]*(?:full.*?movie|movie.*?full|comedy|drama|thriller|horror|film|classic|ganzer film|romantic|family|animal)[^)]*\)\s*$/i,
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
          'Dead Awake (FULL HORROR MOVIE in German, new horror movies 2025, full-length mystery thriller)',
        clean: 'Dead Awake',
      },
      {
        dirty:
          'The Driftless Area - Nothing is as it seems (THRILLING THRILLER with ZOOEY DESHANEL, Mystery)',
        clean: 'The Driftless Area - Nothing is as it seems',
      },
      {
        dirty: 'Watch Golden Winter 2',
        clean: 'Golden Winter 2',
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

/**
 * Extract year and clean title from strings like "Movie Name (1999)" or "Movie Name [2000]"
 *
 * @param title - Raw title
 * @returns Object containing cleaned title and extracted year
 */
export function extractYearAndCleanTitle(title: string): { title: string; year?: number } {
  // 1. Try to extract year from title like "Movie Name (1999)" or "Movie Name [1999]"
  const yearMatch = title.match(/^(.+?)\s*[([](19\d{2}|20\d{2})[)\]]/)
  if (yearMatch && yearMatch[1] && yearMatch[2]) {
    return {
      title: yearMatch[1].trim(),
      year: parseInt(yearMatch[2], 10),
    }
  }

  // 2. Try to extract year from title like "1999 Movie Name" or "[1999] Movie Name"
  const prefixMatch = title.match(/^[([ ]*(19\d{2}|20\d{2})[)\] ]*\s+(.+)$/)
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    return {
      title: prefixMatch[2].trim(),
      year: parseInt(prefixMatch[1], 10),
    }
  }

  return { title: title.trim() }
}

/**
 * General-purpose title cleaner for Archive.org and other sources
 * Removes common patterns that interfere with OMDB matching
 *
 * @param title - Raw title from any source
 * @returns Cleaned title suitable for OMDB search
 */
export function cleanTitleGeneral(title: string): string {
  let cleaned = title

  // 1. Remove leading "- " prefix: "- Sleep My Love" → "Sleep My Love"
  // Common in Archive.org metadata where titles have this prefix
  cleaned = cleaned.replace(/^-\s+/, '')

  // 2. Remove file extensions: ".3gp", ".mp4", ".avi", etc.
  // Also handles cases with space before extension: "Title. 3gp" → "Title"
  cleaned = cleaned.replace(/\.\s*\w{2,4}$/i, '').trim()

  // 3. Remove year prefix at start: "1934 Pipin Der Kurze" → "Pipin Der Kurze"
  cleaned = cleaned.replace(/^(19|20)\d{2}\s+/, '')

  // 3b. Remove leading "- " prefix again (in case year removal exposed it)
  // Example: "1937 - Damals zu Hause" → "1937 " removed → "- Damals zu Hause" → "Damals zu Hause"
  cleaned = cleaned.replace(/^-\s+/, '')

  // 4. Remove "Director Unknown" prefix: "Director Unknown Title" → "Title"
  // Common in Archive.org metadata when director information is not available
  cleaned = cleaned.replace(/^Director\s+Unknown\s+/i, '')

  // 5. Remove possessive forms with quotes: Charlie Chaplin's "Title" → Title
  cleaned = cleaned.replace(/^[^"]+['']s\s*[""]([^""]+)[""].*$/, '$1')

  // 6. Remove actor/director promotional text: "ACTOR NAME is/in TITLE" → TITLE
  // Match: "FIRSTNAME LASTNAME is/in TITLE" or "FIRSTNAME LASTNAME & FIRSTNAME LASTNAME in TITLE"
  cleaned = cleaned.replace(/^[A-Z][A-Z\s&]+\s+(?:is|in)\s+(.+)$/i, '$1')

  // 7. Remove pipe-separated promotional text (keep first part before pipe)
  // Examples: "Title | WAR MOVIE", "Title | Full Movie"
  cleaned = cleaned.replace(
    /\s*\|\s*(?:WAR|ROMANTIC|DRAMA|COMEDY|HORROR|THRILLER|ACTION|SCI-FI|SCIENCE FICTION|SPY|FULL|FREE|HD|4K|MOVIE|FILM|BASED ON|BASADA EN|Subtitulos|subtítulos|with|con|مع|ترجمة|by|por|dir\.).*$/i,
    ''
  )

  // 8. Remove actor lists in parentheses: "Title ( Actor1, Actor2, Actor3 )"
  // Pattern: Parentheses containing multiple capitalized names separated by commas
  // This handles cases like "Heute Abend Bei Mir ( Jenny Jugo, Paul Hörbiger, ... )"
  // Must be done BEFORE step 9 to avoid extracting actor names as titles
  cleaned = cleaned.replace(/\s*\(\s*[A-Z][^,)]+(?:,\s*[A-Z][^,)]+)+\s*\)\s*$/, '')

  // 9. Remove foreign language translations in parentheses (keep English if present)
  // "Foreign Title (English Title)" → "English Title"
  // But NOT if parens contain commas (actor lists), metadata like "German: ...", or colons
  // Only extract if it's a single capitalized phrase without commas
  cleaned = cleaned.replace(/^[^(]+\(\s*([A-Z][^):,]+)\s*\)$/, '$1')

  // 10. Remove metadata in parentheses: (German: ...), (1974, dir. Name)
  cleaned = cleaned.replace(
    /\s*\([^)]*(?:German|French|Spanish|Italian|Russian|dir\.|directed by)[^)]*\)/gi,
    ''
  )

  // 11. Remove genre/type descriptors in parentheses: (the grindhouse experience)
  cleaned = cleaned.replace(/\s*\([^)]*(?:experience|thriller|drama|comedy|horror)\s*\)/gi, '')

  // 12. Remove years in parentheses or brackets: (1999), [2000]
  cleaned = cleaned.replace(/\s*[([][\s\d]{4}[)\]]\s*/g, ' ')

  // 13. Remove actor names from title: "Title - Actor Name (Year)"
  cleaned = cleaned.replace(/\s*[-–—]\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*\(\d{4}\)\s*$/, '')

  // 14. Remove descriptive subtitles after dash/colon (common in Archive.org)
  // But preserve if it's part of the actual title (hyphenated titles)
  // Strategy: Only remove if the part after dash starts with certain words or is very long
  const dashMatch = cleaned.match(/^(.+?)\s*[-–—:]\s*(.+)$/)
  if (dashMatch && dashMatch[1] && dashMatch[2]) {
    const firstPart = dashMatch[1]
    const secondPart = dashMatch[2]
    // Check if firstPart contains spaces (not a hyphenated word)
    const firstPartHasSpaces = /\s/.test(firstPart)
    // If second part looks like a subtitle (starts with article/descriptor or is long), remove it
    if (
      firstPartHasSpaces &&
      (secondPart.length > 25 ||
        /^(A |An |The |Nothing |Everything |Survival |Trust |Two )/.test(secondPart))
    ) {
      cleaned = firstPart
    }
  }

  // 15. Remove quotes around entire title or parts
  cleaned = cleaned.replace(/^[""](.+)[""]$/, '$1')
  cleaned = cleaned.replace(/[""]([^""]+)[""]/, '$1')

  // 16. Remove trailing punctuation and descriptors
  cleaned = cleaned.replace(/[.,!?;:]\s*$/, '')

  // 17. Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // 18. If cleaning resulted in empty string, return original
  return cleaned || title.trim()
}
