/**
 * Analyze failed OMDB entries to identify title cleaning patterns
 */

import { readFileSync } from 'fs'
import { join } from 'path'

interface FailedOmdbEntry {
  identifier: string
  title: string | string[]
  failedAt: string
  reason: string
}

const failedPath = join(process.cwd(), 'public/data/failed-omdb.json')
const failed: FailedOmdbEntry[] = JSON.parse(readFileSync(failedPath, 'utf-8'))

console.log(`\n📊 Analyzing ${failed.length} failed OMDB entries...\n`)

// Extract patterns
const prefixes = new Map<string, number>()
const suffixes = new Map<string, number>()
const hasParens = new Map<string, number>()
const hasBrackets = new Map<string, number>()
const hasQuotes = new Map<string, number>()
const hasPipe = new Map<string, number>()
const hasEmoji = new Map<string, number>()
const hasYear = new Map<string, number>()

failed.forEach(entry => {
  // Handle array titles (skip for now)
  if (Array.isArray(entry.title)) {
    return
  }

  const title = entry.title

  // Detect prefixes (before first dash or colon)
  const dashMatch = title.match(/^([^-:]+?)\s*[-:]\s*/)
  if (dashMatch) {
    const prefix = dashMatch[1].trim()
    // Only count if it looks like an actor/series name (capitalized, not too long)
    if (prefix.length < 30 && /^[A-Z]/.test(prefix)) {
      prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1)
    }
  }

  // Detect suffixes (after last pipe or dash)
  const pipeMatch = title.match(/\|\s*([^|]+?)\s*$/)
  if (pipeMatch) {
    const suffix = pipeMatch[1].trim()
    if (suffix.length < 50) {
      suffixes.set(suffix, (suffixes.get(suffix) || 0) + 1)
    }
  }

  // Detect patterns
  if (/\([^)]+\)/.test(title)) {
    const match = title.match(/\(([^)]+)\)/)
    if (match) {
      hasParens.set(match[1], (hasParens.get(match[1]) || 0) + 1)
    }
  }

  if (/\[[^\]]+\]/.test(title)) {
    const match = title.match(/\[([^\]]+)\]/)
    if (match) {
      hasBrackets.set(match[1], (hasBrackets.get(match[1]) || 0) + 1)
    }
  }

  if (/"[^"]+"/.test(title)) {
    hasQuotes.set(title, (hasQuotes.get(title) || 0) + 1)
  }

  if (/\|/.test(title)) {
    hasPipe.set(title, (hasPipe.get(title) || 0) + 1)
  }

  if (/[\u{1F300}-\u{1F9FF}]/u.test(title)) {
    hasEmoji.set(title, (hasEmoji.get(title) || 0) + 1)
  }

  if (/\b(19|20)\d{2}\b/.test(title)) {
    const match = title.match(/\b((19|20)\d{2})\b/)
    if (match) {
      hasYear.set(match[1], (hasYear.get(match[1]) || 0) + 1)
    }
  }
})

// Print results
console.log('=== COMMON PREFIXES (Actor/Series Names) ===')
Array.from(prefixes.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([prefix, count]) => console.log(`${count.toString().padStart(3)}x: "${prefix}"`))

console.log('\n=== COMMON SUFFIXES (After Pipe) ===')
Array.from(suffixes.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([suffix, count]) => console.log(`${count.toString().padStart(3)}x: "${suffix}"`))

console.log('\n=== CONTENT IN PARENTHESES ===')
Array.from(hasParens.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([content, count]) => console.log(`${count.toString().padStart(3)}x: (${content})`))

console.log('\n=== CONTENT IN BRACKETS ===')
Array.from(hasBrackets.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([content, count]) => console.log(`${count.toString().padStart(3)}x: [${content}]`))

console.log('\n=== PATTERN STATISTICS ===')
console.log(`Titles with quotes:      ${hasQuotes.size}`)
console.log(`Titles with pipes:       ${hasPipe.size}`)
console.log(`Titles with emojis:      ${hasEmoji.size}`)
console.log(`Titles with years:       ${hasYear.size}`)
console.log(`Titles with parentheses: ${hasParens.size}`)
console.log(`Titles with brackets:    ${hasBrackets.size}`)

console.log('\n=== SAMPLE PROBLEMATIC TITLES ===')
failed
  .filter(e => !Array.isArray(e.title))
  .slice(0, 20)
  .forEach(entry => {
    console.log(`"${entry.title}"`)
  })

console.log('\n✅ Analysis complete!\n')
