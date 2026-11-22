/**
 * Build Local IMDb SQLite + FTS5 Index
 *
 * Downloads IMDb non-commercial TSV datasets from https://datasets.imdbws.com/
 * and streams them into data/imdb-index.db for fast offline candidate retrieval.
 *
 * Usage:
 *   pnpm tsx scripts/build-imdb-index.ts
 *   pnpm tsx scripts/build-imdb-index.ts --skip-download --limit 10000
 */

import Database from 'better-sqlite3'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

const BASE_URL = 'https://datasets.imdbws.com'
const DATASETS = [
  'title.basics.tsv.gz',
  'title.akas.tsv.gz',
  'name.basics.tsv.gz',
  'title.principals.tsv.gz',
] as const

const BATCH_SIZE = 10_000
const RELEVANT_PRINCIPAL_CATEGORIES = new Set(['director', 'actor', 'actress'])

interface CliOptions {
  skipDownload: boolean
  forceDownload: boolean
  limit: number | null
  dbPath: string
  cacheDir: string
}

function parseArgs(argv: string[]): CliOptions {
  let skipDownload = false
  let forceDownload = false
  let limit: number | null = null
  let dbPath = join(process.cwd(), 'data', 'imdb-index.db')
  let cacheDir = join(process.cwd(), 'data', 'imdb-datasets')

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg) continue
    if (arg === '--skip-download') {
      skipDownload = true
    } else if (arg === '--force-download') {
      forceDownload = true
    } else if (arg.startsWith('--limit=')) {
      const val = parseInt(arg.slice('--limit='.length), 10)
      if (!Number.isNaN(val) && val > 0) limit = val
    } else if (arg === '--limit' && argv[i + 1]) {
      const val = parseInt(argv[i + 1]!, 10)
      if (!Number.isNaN(val) && val > 0) limit = val
      i++
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice('--db='.length)
    } else if (arg.startsWith('--cache-dir=')) {
      cacheDir = arg.slice('--cache-dir='.length)
    }
  }

  return { skipDownload, forceDownload, limit, dbPath, cacheDir }
}

function cleanTsvField(val: string | undefined): string | null {
  if (!val || val === '\\N') return null
  return val
}

function parseIntField(val: string | undefined): number | null {
  if (!val || val === '\\N') return null
  const n = parseInt(val, 10)
  return Number.isNaN(n) ? null : n
}

async function downloadDataset(filename: string, destPath: string): Promise<void> {
  const url = `${BASE_URL}/${filename}`
  console.log(`[IMDb Index] Downloading ${url} -> ${destPath}`)
  mkdirSync(dirname(destPath), { recursive: true })

  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status} ${response.statusText}`)
  }

  const tmpPath = `${destPath}.tmp`
  const bodyStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  await pipeline(bodyStream, createWriteStream(tmpPath))
  renameSync(tmpPath, destPath)
  console.log(`[IMDb Index] Downloaded ${filename}`)
}

async function streamTsvGz(
  filePath: string,
  limit: number | null,
  onBatch: (rows: string[][]) => void
): Promise<number> {
  const gunzip = createGunzip()
  const rl = createInterface({
    input: createReadStream(filePath).pipe(gunzip),
    crlfDelay: Infinity,
  })

  let isHeader = true
  let totalRows = 0
  let batch: string[][] = []

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false
      continue
    }
    if (!line) continue

    batch.push(line.split('\t'))
    totalRows++

    if (batch.length >= BATCH_SIZE) {
      onBatch(batch)
      batch = []
    }

    if (limit !== null && totalRows >= limit) {
      rl.close()
      break
    }
  }

  if (batch.length > 0) {
    onBatch(batch)
  }

  return totalRows
}

function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -64000')

  db.exec(`
    DROP TABLE IF EXISTS titles_fts;
    DROP TABLE IF EXISTS principals;
    DROP TABLE IF EXISTS names;
    DROP TABLE IF EXISTS akas;
    DROP TABLE IF EXISTS titles;

    CREATE TABLE titles (
      tconst TEXT PRIMARY KEY,
      titleType TEXT,
      primaryTitle TEXT,
      originalTitle TEXT,
      isAdult INTEGER,
      startYear INTEGER,
      runtimeMinutes INTEGER,
      genres TEXT
    );

    CREATE TABLE akas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titleId TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT,
      language TEXT,
      isOriginalTitle INTEGER
    );

    CREATE TABLE names (
      nconst TEXT PRIMARY KEY,
      primaryName TEXT NOT NULL
    );

    CREATE TABLE principals (
      tconst TEXT NOT NULL,
      ordering INTEGER,
      nconst TEXT NOT NULL,
      category TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE titles_fts USING fts5(
      tconst UNINDEXED,
      title,
      titleType UNINDEXED,
      startYear UNINDEXED
    );
  `)
}

async function importTitleBasics(
  db: Database.Database,
  filePath: string,
  limit: number | null
): Promise<void> {
  const insertTitle = db.prepare(`
    INSERT OR IGNORE INTO titles
      (tconst, titleType, primaryTitle, originalTitle, isAdult, startYear, runtimeMinutes, genres)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertFts = db.prepare(`
    INSERT INTO titles_fts (tconst, title, titleType, startYear)
    VALUES (?, ?, ?, ?)
  `)

  const insertBatch = db.transaction((rows: string[][]) => {
    for (const cols of rows) {
      const tconst = cleanTsvField(cols[0])
      const titleType = cleanTsvField(cols[1])
      const primaryTitle = cleanTsvField(cols[2])
      const originalTitle = cleanTsvField(cols[3])
      const isAdult = parseIntField(cols[4]) ?? 0
      const startYear = parseIntField(cols[5])
      const runtimeMinutes = parseIntField(cols[7])
      const genres = cleanTsvField(cols[8])

      if (!tconst || !primaryTitle || isAdult === 1) continue

      insertTitle.run(
        tconst,
        titleType,
        primaryTitle,
        originalTitle,
        isAdult,
        startYear,
        runtimeMinutes,
        genres
      )
      insertFts.run(tconst, primaryTitle, titleType, startYear)
      if (originalTitle && originalTitle !== primaryTitle) {
        insertFts.run(tconst, originalTitle, titleType, startYear)
      }
    }
  })

  const count = await streamTsvGz(filePath, limit, insertBatch)
  console.log(`[IMDb Index] Imported ${count} rows from title.basics.tsv.gz`)
}

async function importTitleAkas(
  db: Database.Database,
  filePath: string,
  limit: number | null
): Promise<void> {
  const insertAka = db.prepare(`
    INSERT INTO akas (titleId, title, region, language, isOriginalTitle)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertFts = db.prepare(`
    INSERT INTO titles_fts (tconst, title, titleType, startYear)
    VALUES (?, ?, NULL, NULL)
  `)

  const insertBatch = db.transaction((rows: string[][]) => {
    for (const cols of rows) {
      const titleId = cleanTsvField(cols[0])
      const title = cleanTsvField(cols[2])
      const region = cleanTsvField(cols[3])
      const language = cleanTsvField(cols[4])
      const isOriginalTitle = parseIntField(cols[7]) ?? 0

      if (!titleId || !title) continue

      insertAka.run(titleId, title, region, language, isOriginalTitle)
      insertFts.run(titleId, title)
    }
  })

  const count = await streamTsvGz(filePath, limit, insertBatch)
  console.log(`[IMDb Index] Imported ${count} rows from title.akas.tsv.gz`)
}

async function importNameBasics(
  db: Database.Database,
  filePath: string,
  limit: number | null
): Promise<void> {
  const insertName = db.prepare(`
    INSERT OR IGNORE INTO names (nconst, primaryName)
    VALUES (?, ?)
  `)

  const insertBatch = db.transaction((rows: string[][]) => {
    for (const cols of rows) {
      const nconst = cleanTsvField(cols[0])
      const primaryName = cleanTsvField(cols[1])
      if (!nconst || !primaryName) continue
      insertName.run(nconst, primaryName)
    }
  })

  const count = await streamTsvGz(filePath, limit, insertBatch)
  console.log(`[IMDb Index] Imported ${count} rows from name.basics.tsv.gz`)
}

async function importTitlePrincipals(
  db: Database.Database,
  filePath: string,
  limit: number | null
): Promise<void> {
  const insertPrincipal = db.prepare(`
    INSERT INTO principals (tconst, ordering, nconst, category)
    VALUES (?, ?, ?, ?)
  `)

  const insertBatch = db.transaction((rows: string[][]) => {
    for (const cols of rows) {
      const tconst = cleanTsvField(cols[0])
      const ordering = parseIntField(cols[1])
      const nconst = cleanTsvField(cols[2])
      const category = cleanTsvField(cols[3])

      if (!tconst || !nconst || !category || !RELEVANT_PRINCIPAL_CATEGORIES.has(category)) {
        continue
      }

      insertPrincipal.run(tconst, ordering, nconst, category)
    }
  })

  const count = await streamTsvGz(filePath, limit, insertBatch)
  console.log(`[IMDb Index] Imported ${count} rows from title.principals.tsv.gz`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  console.log('[IMDb Index] Options:', options)

  mkdirSync(dirname(options.dbPath), { recursive: true })
  mkdirSync(options.cacheDir, { recursive: true })

  for (const dataset of DATASETS) {
    const localPath = join(options.cacheDir, dataset)
    const hasLocalFile = existsSync(localPath) && statSync(localPath).size > 0
    if (options.skipDownload) {
      if (!hasLocalFile) {
        throw new Error(`Missing local dataset file with --skip-download: ${localPath}`)
      }
      console.log(`[IMDb Index] Using cached ${dataset}`)
    } else if (hasLocalFile && !options.forceDownload) {
      console.log(
        `[IMDb Index] Skipping download for ${dataset} (already exists; pass --force-download to refresh)`
      )
    } else {
      await downloadDataset(dataset, localPath)
    }
  }

  const db = new Database(options.dbPath)
  try {
    console.log(`[IMDb Index] Initializing SQLite schema at ${options.dbPath}`)
    initializeSchema(db)

    await importTitleBasics(db, join(options.cacheDir, 'title.basics.tsv.gz'), options.limit)
    await importTitleAkas(db, join(options.cacheDir, 'title.akas.tsv.gz'), options.limit)
    await importNameBasics(db, join(options.cacheDir, 'name.basics.tsv.gz'), options.limit)
    await importTitlePrincipals(
      db,
      join(options.cacheDir, 'title.principals.tsv.gz'),
      options.limit
    )

    console.log('[IMDb Index] Creating lookup indexes...')
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_akas_titleId ON akas(titleId);
      CREATE INDEX IF NOT EXISTS idx_principals_tconst ON principals(tconst);
      CREATE INDEX IF NOT EXISTS idx_titles_startYear ON titles(startYear);
    `)

    console.log('[IMDb Index] Done!')
  } finally {
    db.close()
  }
}

main().catch(error => {
  console.error('[IMDb Index] Fatal error:', error)
  process.exit(1)
})
