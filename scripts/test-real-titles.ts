#!/usr/bin/env tsx
import { cleanTitle } from './utils/titleCleaner.ts'

const titles = [
  'Watch Golden Winter 2',
  'Dead Awake (FULL HORROR MOVIE in German, new horror movies 2025, full-length mystery thriller)',
  'The Driftless Area - Nothing is as it seems (THRILLING THRILLER with ZOOEY DESHANEL, Mystery)',
]

console.log('Testing title cleaner with real database titles:\n')

for (const title of titles) {
  const cleaned = cleanTitle(title, '@Netzkino')
  const changed = cleaned !== title
  console.log(`${changed ? '✓ CLEANED' : '✗ NO CHANGE'}: "${title}"`)
  if (changed) {
    console.log(`  → "${cleaned}"`)
  }
  console.log()
}
