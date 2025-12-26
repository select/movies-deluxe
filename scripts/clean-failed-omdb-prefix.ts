import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface FailedOmdbAttempt {
  query: string
  year?: number
}

interface FailedOmdbEntry {
  identifier: string
  title?: string
  originalTitle?: string
  year?: number
  attempts?: FailedOmdbAttempt[]
  failedAt: string
  reason: string
}

async function cleanFailedOmdbPrefix() {
  const failedPath = resolve('public/data/failed-omdb.json')

  // Read failed entries
  const data = await readFile(failedPath, 'utf-8')
  const entries: FailedOmdbEntry[] = JSON.parse(data)

  console.log(`Total failed OMDB entries: ${entries.length}`)

  // Find entries with "- " prefix in any attempt query
  const entriesToRemove = entries.filter(entry => {
    if (!entry.attempts || entry.attempts.length === 0) {
      return false
    }

    return entry.attempts.some(attempt => attempt.query.startsWith('- '))
  })

  console.log(`Entries with "- " prefix in queries: ${entriesToRemove.length}`)

  if (entriesToRemove.length === 0) {
    console.log('No entries to clean. Exiting.')
    return
  }

  // Show some examples
  console.log('\nExample entries to be removed for retry:')
  entriesToRemove.slice(0, 5).forEach(entry => {
    console.log(`  - ${entry.identifier}`)
    entry.attempts?.forEach(attempt => {
      if (attempt.query.startsWith('- ')) {
        console.log(`    Query: "${attempt.query}"`)
      }
    })
  })

  // Remove entries with "- " prefix
  const cleanedEntries = entries.filter(entry => {
    if (!entry.attempts || entry.attempts.length === 0) {
      return true
    }

    return !entry.attempts.some(attempt => attempt.query.startsWith('- '))
  })

  console.log(`\nRemaining failed entries: ${cleanedEntries.length}`)
  console.log(`Removed entries: ${entries.length - cleanedEntries.length}`)

  // Write cleaned entries back
  await writeFile(failedPath, JSON.stringify(cleanedEntries, null, 2))

  console.log(`\n✅ Cleaned failed-omdb.json`)
  console.log(`These ${entriesToRemove.length} entries can now be retried with cleaned titles.`)
}

cleanFailedOmdbPrefix().catch(console.error)
