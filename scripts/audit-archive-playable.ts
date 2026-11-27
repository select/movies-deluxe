#!/usr/bin/env node
/**
 * Audit active Archive.org sources in data/movies.db for playable video formats.
 *
 * Uses the Archive.org Scrape API (`fields=identifier,format,mediatype,item_size`)
 * and verifies any flagged or missing items against `https://archive.org/metadata/<id>`.
 *
 * Usage:
 *   pnpm tsx scripts/audit-archive-playable.ts            # Dry run (report only)
 *   pnpm tsx scripts/audit-archive-playable.ts --apply    # Update data/movies.db
 *   pnpm tsx scripts/audit-archive-playable.ts --limit 20 # Limit metadata verification calls
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  hasPlayableVideoFormat,
  hasPlayableVideoFile,
  type ArchiveOrgFile,
} from '../server/utils/archive'
import type { SourceUnavailableReason } from '../shared/types/movie'

interface DbActiveSource {
  id: number
  movieId: string
  sourceId: string
  title: string | null
}

interface ScrapeItem {
  identifier: string
  format?: string | string[]
  mediatype?: string
  item_size?: number
}

interface ScrapeResponse {
  items?: ScrapeItem[]
  count?: number
  total?: number
  cursor?: string
}

interface VerifiedFailure {
  sourceId: string
  reason: SourceUnavailableReason
  detail: string
  formats: string[]
  pattern: string
  mediatype?: string
  itemSize?: number
  titles: string[]
  dbRowIds: number[]
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const limitIdx = args.indexOf('--limit')
const VERIFY_LIMIT = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity
const collectionIdx = args.indexOf('--collection')
const COLLECTION = collectionIdx !== -1 ? String(args[collectionIdx + 1]) : 'feature_films'

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeFormats(format?: string | string[] | null): string[] {
  if (!format) return []
  return (Array.isArray(format) ? format : [format]).filter(
    (f): f is string => typeof f === 'string' && f.trim().length > 0
  )
}

function classifyFormatPattern(formats: string[], files: ArchiveOrgFile[]): string {
  const nonMeta = formats.filter(
    f =>
      ![
        'Metadata',
        'Archive BitTorrent',
        'Item Tile',
        'JPEG Thumb',
        'Animated GIF',
        'Thumbnail',
      ].includes(f)
  )
  const lower = nonMeta.map(f => f.toLowerCase())

  if (lower.some(f => f === 'rar' || f.includes('rar'))) return 'RAR-only / archive'
  if (lower.some(f => f === 'zip' || f.includes('zip'))) return 'ZIP-only / archive'
  if (lower.some(f => f.includes('iso') || f.includes('disk image'))) return 'ISO / disk image'
  if (
    lower.some(
      f =>
        f.includes('mp3') ||
        f.includes('flac') ||
        f.includes('ogg vorbis') ||
        f.includes('wav') ||
        f.includes('audio')
    )
  ) {
    return 'Audio-only'
  }
  if (
    lower.some(
      f => f.includes('pdf') || f.includes('epub') || f.includes('text') || f.includes('djvu')
    )
  ) {
    return 'Document/text-only'
  }
  if (lower.some(f => ['png', 'jpeg', 'gif', 'tiff', 'bmp', 'webp'].includes(f))) {
    return 'Image-only'
  }
  if (files.length === 0) return 'No files'
  if (nonMeta.length === 0) return 'Metadata/torrent-only'
  return `Other (${nonMeta.join(', ')})`
}

async function fetchScrapePage(url: string, maxAttempts = 4): Promise<ScrapeResponse> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return (await response.json()) as ScrapeResponse
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await sleep(500 * Math.pow(2, attempt - 1))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function scrapeCollection(
  collection: string,
  targetIds: Set<string>
): Promise<Map<string, ScrapeItem>> {
  const results = new Map<string, ScrapeItem>()
  let cursor: string | undefined
  let page = 0
  let total: number | undefined

  while (true) {
    page++
    const url = new URL('https://archive.org/services/search/v1/scrape')
    url.searchParams.set('q', `collection:${collection}`)
    url.searchParams.set('fields', 'identifier,format,mediatype,item_size')
    url.searchParams.set('count', '1000')
    if (cursor) url.searchParams.set('cursor', cursor)

    const data = await fetchScrapePage(url.toString())
    if (total === undefined && typeof data.total === 'number') {
      total = data.total
    }

    const items = Array.isArray(data.items) ? data.items : []
    if (items.length === 0) break

    for (const item of items) {
      if (item.identifier && targetIds.has(item.identifier)) {
        results.set(item.identifier, item)
      }
    }

    if (page === 1 || page % 10 === 0 || !data.cursor) {
      console.log(
        `  [Scrape ${collection}] page ${page}: matched ${results.size}/${targetIds.size} DB sources (API total: ${total ?? '?'})`
      )
    }

    if (!data.cursor || data.cursor === cursor) break
    cursor = data.cursor
    await sleep(100)
  }

  return results
}

async function scrapeByIdentifiers(identifiers: string[]): Promise<Map<string, ScrapeItem>> {
  const results = new Map<string, ScrapeItem>()
  const BATCH_SIZE = 50

  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE)
    const query = `identifier:(${batch.map(id => `"${id.replace(/"/g, '')}"`).join(' OR ')})`
    const url = new URL('https://archive.org/services/search/v1/scrape')
    url.searchParams.set('q', query)
    url.searchParams.set('fields', 'identifier,format,mediatype,item_size')
    url.searchParams.set('count', '100')

    const data = await fetchScrapePage(url.toString())
    for (const item of data.items || []) {
      if (item.identifier) {
        results.set(item.identifier, item)
      }
    }

    if (i + BATCH_SIZE < identifiers.length) {
      await sleep(150)
    }
  }

  return results
}

async function verifyAgainstMetadata(
  sourceId: string,
  scrapeItem?: ScrapeItem
): Promise<
  | { playable: true; matchedFormats: string[] }
  | {
      playable: false
      reason: SourceUnavailableReason
      detail: string
      formats: string[]
      pattern: string
    }
> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(sourceId)}`, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'MoviesDeluxeAudit/1.0' },
      })

      if (response.status === 404) {
        return {
          playable: false,
          reason: 'deleted',
          detail: 'HTTP 404 from /metadata',
          formats: [],
          pattern: 'Deleted (404)',
        }
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        await sleep(500 * Math.pow(2, attempt))
        continue
      }

      if (!response.ok) {
        return {
          playable: false,
          reason: 'unavailable_unknown',
          detail: `HTTP ${response.status} from /metadata`,
          formats: [],
          pattern: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as Record<string, unknown>
      if (!data || Object.keys(data).length === 0) {
        return {
          playable: false,
          reason: 'deleted',
          detail: 'Empty metadata response {}',
          formats: [],
          pattern: 'Empty metadata',
        }
      }

      if (data.is_dark === true) {
        const darkReason =
          typeof data.dark_reason === 'string' && data.dark_reason
            ? data.dark_reason
            : 'is_dark: true'
        return {
          playable: false,
          reason: 'archive_dark',
          detail: darkReason,
          formats: normalizeFormats(scrapeItem?.format),
          pattern: 'Archive dark',
        }
      }

      const files = Array.isArray(data.files) ? (data.files as ArchiveOrgFile[]) : []
      if (hasPlayableVideoFile(files)) {
        const fileFormats = [
          ...new Set(files.map(f => f.format).filter((f): f is string => Boolean(f))),
        ]
        return { playable: true, matchedFormats: fileFormats }
      }

      const fileFormats = [
        ...new Set(files.map(f => f.format).filter((f): f is string => Boolean(f))),
      ]
      const formats = fileFormats.length > 0 ? fileFormats : normalizeFormats(scrapeItem?.format)
      const pattern = classifyFormatPattern(formats, files)

      return {
        playable: false,
        reason: 'no_video_file',
        detail: `No playable video file; formats: ${formats.join(', ') || '(none)'}`,
        formats,
        pattern,
      }
    } catch (err) {
      if (attempt < maxAttempts) {
        await sleep(500 * Math.pow(2, attempt))
        continue
      }
      throw err
    }
  }

  throw new Error(`Exhausted retries verifying ${sourceId}`)
}

async function main(): Promise<void> {
  const dbPath = join(process.cwd(), 'data', 'movies.db')
  if (!existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`)
    process.exit(1)
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  const rows = db
    .prepare(
      `SELECT id, movieId, sourceId, title
       FROM sources
       WHERE channelId = 'archive.org' AND status = 'active'`
    )
    .all() as DbActiveSource[]

  const bySourceId = new Map<string, DbActiveSource[]>()
  for (const row of rows) {
    const list = bySourceId.get(row.sourceId) || []
    list.push(row)
    bySourceId.set(row.sourceId, list)
  }

  console.log(
    `Loaded ${rows.length} active archive.org source rows (${bySourceId.size} unique sourceIds). Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`
  )

  const targetIds = new Set(bySourceId.keys())

  // 1. Scrape primary collection
  console.log(`\nStep 1: Scraping Archive.org collection "${COLLECTION}"...`)
  const scrapeMap = await scrapeCollection(COLLECTION, targetIds)

  // 2. Scrape remaining IDs not found in primary collection
  const remainingIds = [...targetIds].filter(id => !scrapeMap.has(id))
  console.log(
    `\nStep 2: ${remainingIds.length} active sourceIds not in "${COLLECTION}" scrape; querying by identifier...`
  )
  if (remainingIds.length > 0) {
    const extraMap = await scrapeByIdentifiers(remainingIds)
    for (const [id, item] of extraMap.entries()) {
      scrapeMap.set(id, item)
    }
    console.log(`  Found ${extraMap.size}/${remainingIds.length} via identifier batch scrape.`)
  }

  // 3. Identify candidates without playable video format
  const candidates: Array<{ sourceId: string; scrapeItem?: ScrapeItem }> = []
  let playableByScrapeCount = 0

  for (const sourceId of targetIds) {
    const item = scrapeMap.get(sourceId)
    if (item && hasPlayableVideoFormat(item.format)) {
      playableByScrapeCount++
    } else {
      candidates.push({ sourceId, scrapeItem: item })
    }
  }

  console.log(
    `\nStep 3: Scrape API check complete: ${playableByScrapeCount} playable, ${candidates.length} flagged for /metadata verification.`
  )

  // 4. Verify all flagged candidates against /metadata/<id>
  const toVerify = candidates.slice(0, VERIFY_LIMIT)
  const verifiedFailures: VerifiedFailure[] = []
  const falsePositives: Array<{
    sourceId: string
    scrapeFormats: string[]
    fileFormats: string[]
  }> = []
  const verifyErrors: Array<{ sourceId: string; error: string }> = []

  console.log(`\nStep 4: Verifying ${toVerify.length} candidate(s) against /metadata/<id>...`)
  for (let i = 0; i < toVerify.length; i++) {
    const { sourceId, scrapeItem } = toVerify[i]!
    try {
      const res = await verifyAgainstMetadata(sourceId, scrapeItem)
      if (res.playable) {
        falsePositives.push({
          sourceId,
          scrapeFormats: normalizeFormats(scrapeItem?.format),
          fileFormats: res.matchedFormats,
        })
      } else {
        const dbRows = bySourceId.get(sourceId) || []
        verifiedFailures.push({
          sourceId,
          reason: res.reason,
          detail: res.detail,
          formats: res.formats,
          pattern: res.pattern,
          mediatype: scrapeItem?.mediatype,
          itemSize: scrapeItem?.item_size,
          titles: dbRows.map(r => r.title || r.movieId),
          dbRowIds: dbRows.map(r => r.id),
        })
      }
    } catch (err) {
      verifyErrors.push({
        sourceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    if ((i + 1) % 25 === 0 || i + 1 === toVerify.length) {
      console.log(
        `  Verified ${i + 1}/${toVerify.length} (failures so far: ${verifiedFailures.length})`
      )
    }
    await sleep(150)
  }

  // 5. Breakdown report
  console.log('\n=== AUDIT SUMMARY ===')
  console.log(`Active DB sourceIds checked: ${targetIds.size} (${rows.length} rows)`)
  console.log(`Playable via Scrape API:     ${playableByScrapeCount}`)
  console.log(`Flagged for /metadata check: ${toVerify.length}`)
  console.log(`False positives (playable):  ${falsePositives.length}`)
  console.log(`Confirmed unplayable:        ${verifiedFailures.length}`)
  console.log(`Verification errors:         ${verifyErrors.length}`)

  if (falsePositives.length > 0) {
    console.log('\nFalse positives (Scrape API missed, but /metadata had video):')
    for (const fp of falsePositives.slice(0, 20)) {
      console.log(
        `  - ${fp.sourceId}: scrape=[${fp.scrapeFormats.join(', ')}] files=[${fp.fileFormats.join(', ')}]`
      )
    }
  }

  const byReason = new Map<string, number>()
  const byPattern = new Map<string, number>()
  let totalAffectedRows = 0
  for (const f of verifiedFailures) {
    byReason.set(f.reason, (byReason.get(f.reason) || 0) + 1)
    byPattern.set(f.pattern, (byPattern.get(f.pattern) || 0) + 1)
    totalAffectedRows += f.dbRowIds.length
  }

  console.log(`\nConfirmed unplayable by reason (${totalAffectedRows} DB rows):`)
  for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`)
  }

  console.log('\nConfirmed unplayable by format pattern:')
  for (const [pattern, count] of [...byPattern.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pattern}: ${count}`)
  }

  const svtplayFailures = verifiedFailures.filter(f => f.sourceId.startsWith('svtplay-'))
  console.log(`\nsvtplay-* unplayable items: ${svtplayFailures.length}`)
  for (const f of svtplayFailures.slice(0, 15)) {
    console.log(`  - ${f.sourceId} (${f.titles[0] || ''}): ${f.pattern} [${f.formats.join(', ')}]`)
  }

  console.log('\nSample non-svtplay unplayable items:')
  for (const f of verifiedFailures.filter(x => !x.sourceId.startsWith('svtplay-')).slice(0, 20)) {
    console.log(
      `  - ${f.sourceId} (${f.titles[0] || ''}): ${f.reason} | ${f.pattern} [${f.formats.join(', ')}]`
    )
  }

  if (verifyErrors.length > 0) {
    console.log('\nVerification errors:')
    for (const e of verifyErrors.slice(0, 10)) {
      console.log(`  - ${e.sourceId}: ${e.error}`)
    }
  }

  // 6. Apply updates if requested
  if (APPLY && verifiedFailures.length > 0) {
    const now = Math.floor(Date.now() / 1000)
    const updateStmt = db.prepare(`
      UPDATE sources
      SET status = 'unavailable',
          unavailableReason = ?,
          unavailableDetail = ?,
          lastCheckedAt = ?,
          statusChangedAt = ?
      WHERE id = ?
    `)

    const applyTx = db.transaction(() => {
      let updatedRows = 0
      for (const f of verifiedFailures) {
        for (const rowId of f.dbRowIds) {
          updateStmt.run(f.reason, f.detail, now, now, rowId)
          updatedRows++
        }
      }
      return updatedRows
    })

    const updatedRows = applyTx()
    console.log(
      `\nApplied updates: marked ${updatedRows} source rows as unavailable in data/movies.db.`
    )
  } else if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to update data/movies.db.')
  }

  db.close()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
