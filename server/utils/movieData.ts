import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { normalizeTitleForComparison } from '../../shared/utils/movieTitle'
import type { MoviesDatabase, MovieEntry, MovieSource } from '../../shared/types/movie'

const DATA_DIR = join(process.cwd(), 'data')
const MOVIES_FILE = join(DATA_DIR, 'movies.json')

/**
 * Normalize language field to handle string | string[] types
 */
function normalizeLanguage(language: string | string[] | undefined): string | undefined {
  if (!language) return undefined
  if (Array.isArray(language)) {
    return language.length > 0 ? language[0] : undefined
  }
  return language
}

/**
 * Fast extraction of all keys from movies.json using ripgrep
 * This is 3-8x faster than regex and 3x faster than JSON.parse + Object.keys
 *
 * Requires ripgrep (rg) to be installed
 *
 * @param options - Filter options
 *   - 'all': Extract all keys (default)
 *   - 'matched': Extract only IMDB keys (tt*)
 *   - 'unmatched': Extract only non-IMDB keys (archive-*, youtube-*)
 *   - function: Custom filter function
 * @param additionalFilter - Optional additional filter to apply after the main filter
 * @returns Array of all top-level keys in the database
 */
export async function extractMovieKeys(
  options?: 'all' | 'matched' | 'unmatched' | ((key: string) => boolean),
  additionalFilter?: (key: string) => boolean
): Promise<string[]> {
  if (!existsSync(MOVIES_FILE)) {
    return []
  }

  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)

  let command: string

  // Use optimized ripgrep patterns for common filters
  if (options === 'matched') {
    // Only match keys starting with "tt"
    command = `rg '^  "(tt[^"]+)":' -o -r '$1' --no-filename --no-line-number "${MOVIES_FILE}"`
  } else if (options === 'unmatched') {
    // Match keys that start with archive- or youtube-
    command = `rg '^  "((?:archive-|youtube-)[^"]+)":' -o -r '$1' --no-filename --no-line-number "${MOVIES_FILE}"`
  } else {
    // Extract all keys
    command = `rg '^  "([^"]+)":' -o -r '$1' --no-filename --no-line-number "${MOVIES_FILE}"`
  }

  const { stdout } = await execAsync(command, {
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  })

  let keys = stdout.trim().split('\n').filter(Boolean)

  // Apply custom filter function if provided as first argument
  if (typeof options === 'function') {
    keys = keys.filter(options)
  }

  // Apply additional filter if provided
  if (additionalFilter) {
    keys = keys.filter(additionalFilter)
  }

  return keys
}

/**
 * Fast extraction of unmatched movie keys (non-IMDB IDs)
 * Much faster than loading the entire database
 *
 * @deprecated Use extractMovieKeys('unmatched') instead
 */
export async function extractUnmatchedMovieKeys(): Promise<string[]> {
  return extractMovieKeys('unmatched')
}

/**
 * Fast extraction of matched movie keys (IMDB IDs only)
 * Much faster than loading the entire database
 *
 * @deprecated Use extractMovieKeys('matched') instead
 */
export async function extractMatchedMovieKeys(): Promise<string[]> {
  return extractMovieKeys('matched')
}

// loadMoviesDatabase has been moved to loadMoviesDatabase.ts
// Import directly from there instead of using this deprecated wrapper

/**
 * Save the movies database to disk
 *
 * @deprecated This function is deprecated and should not be used.
 * All movie data is now stored in SQLite (data/movies.db).
 * Use upsertMovie() from server/utils/upsertMovie.ts for writing movie data.
 * This function is kept only for backward compatibility and may be removed in the future.
 */
export async function saveMoviesDatabase(db: MoviesDatabase): Promise<void> {
  console.warn(
    '[DEPRECATED] saveMoviesDatabase() is deprecated. Use SQLite operations instead (upsertMovie).'
  )
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true })
    }

    db._schema.lastUpdated = new Date().toISOString()
    const content = JSON.stringify(db, null, 2)
    await writeFile(MOVIES_FILE, content, 'utf-8')

    // Clear the index after saving since the database has been modified
    clearSourceIdIndex()
  } catch (error) {
    console.error('Failed to save movies database:', error)
    throw error
  }
}

function _createEmptyDatabase(): MoviesDatabase {
  return {
    _schema: {
      version: '1.0.0',
      description: 'Centralized movie database indexed by movieId.',
      lastUpdated: new Date().toISOString(),
    },
  }
}

/**
 * Source ID to Movie ID index
 * Maps source IDs to their parent movie IDs for fast lookups
 */
let sourceIdIndex: Map<string, string> | undefined

/**
 * Build an index of source IDs to movie IDs for fast lookups
 * This index is built once and reused for subsequent lookups
 */
export function buildSourceIdIndex(db: MoviesDatabase): Map<string, string> {
  const index = new Map<string, string>()

  for (const [key, value] of Object.entries(db)) {
    if (key.startsWith('_')) continue
    const entry = value as MovieEntry
    if (entry.sources) {
      for (const source of entry.sources) {
        index.set(source.id, key)
      }
    }
  }

  sourceIdIndex = index
  return index
}

/**
 * Get or create the source ID index
 * If the index doesn't exist, it will be built automatically
 */
export function getSourceIdIndex(db: MoviesDatabase): Map<string, string> {
  if (!sourceIdIndex) {
    return buildSourceIdIndex(db)
  }
  return sourceIdIndex
}

/**
 * Clear the source ID index
 * Call this when the database is modified to force a rebuild on next access
 */
export function clearSourceIdIndex(): void {
  sourceIdIndex = undefined
}

// upsertMovie has been moved to upsertMovie.ts for SQLite operations
// The JSON-based version has been removed - use upsertMovieToSQLite instead

export interface ChannelStats {
  id: string
  name: string
  language?: string
  enabled: boolean
  scraped: number
}

export interface DatabaseStats {
  total: number
  matched: number
  unmatched: number
  archiveOrgSources: number
  youtubeSources: number
  curatedCount: number
  collections: Record<string, number>
}

/**
 * Get statistics about the database
 */
export async function getDatabaseStats(db: MoviesDatabase): Promise<DatabaseStats> {
  const { stats } = await getDatabaseStatsWithChannels(db)
  return stats
}

/**
 * Get statistics about the database including channel stats
 */
export async function getDatabaseStatsWithChannels(db: MoviesDatabase): Promise<{
  stats: DatabaseStats
  youtubeChannels: ChannelStats[]
}> {
  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))
  const matched = entries.filter(([key]) => key.startsWith('tt')).length
  const unmatched = entries.length - matched

  const stats: DatabaseStats = {
    total: entries.length,
    matched,
    unmatched,
    archiveOrgSources: 0,
    youtubeSources: 0,
    curatedCount: 0,
    collections: {} as Record<string, number>,
  }

  // Load channel configs
  const channelConfigs = await loadYouTubeChannels()
  const channelStatsMap = new Map<string, ChannelStats>()

  // Initialize channel stats (indexed by channel ID)
  for (const config of channelConfigs) {
    channelStatsMap.set(config.id, {
      id: config.id,
      name: config.name,
      language: config.language,
      enabled: config.enabled,
      scraped: 0,
    })
  }

  entries.forEach(([_, entry]) => {
    const movieEntry = entry as MovieEntry

    movieEntry.sources?.forEach((source: MovieSource) => {
      if (source.type === 'archive.org') {
        stats.archiveOrgSources++
      }
      if (source.type === 'youtube') {
        stats.youtubeSources++

        // Count per channel (match by channel ID)
        const channelStats = channelStatsMap.get(source.channelId ?? '')
        if (channelStats) {
          channelStats.scraped++
        }
      }
    })
    // Consider curated if it has metadata and was manually updated or has high confidence
    if (
      movieEntry.metadata &&
      !movieEntry.movieId.startsWith('archive-') &&
      !movieEntry.movieId.startsWith('youtube-')
    ) {
      stats.curatedCount++
    }
  })

  const youtubeChannels = Array.from(channelStatsMap.values())

  return { stats, youtubeChannels }
}

/**
 * Load YouTube channel configurations
 */
async function loadYouTubeChannels(): Promise<
  Array<{ id: string; handle?: string; name: string; language?: string; enabled: boolean }>
> {
  try {
    const { readFile } = await import('fs/promises')
    const { resolve } = await import('path')
    const configPath = resolve(process.cwd(), 'config/youtube-channels.json')
    const configData = await readFile(configPath, 'utf-8')
    const config = JSON.parse(configData)
    return config.channels || []
  } catch (e) {
    console.error('Failed to load youtube-channels.json', e)
    return []
  }
}

// migrateMovieId has been moved to migrateMovieId.ts for SQLite operations
// This JSON-based version is deprecated and should not be used

/**
 * Find potential duplicate movies by title similarity
 */
export function findPotentialDuplicates(
  db: MoviesDatabase,
  threshold: number = 0.85
): Array<{ entries: MovieEntry[]; similarity: number }> {
  const entries = Object.entries(db)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, entry]) => entry as MovieEntry)

  const duplicates: Array<{ entries: MovieEntry[]; similarity: number }> = []

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const entryI = entries[i]
      const entryJ = entries[j]

      if (!entryI || !entryJ) continue

      const title1 = entryI.title.toLowerCase()
      const title2 = entryJ.title.toLowerCase()

      // Simple similarity check (can be improved with Levenshtein distance)
      const similarity = calculateSimilarity(title1, title2)

      if (similarity >= threshold) {
        duplicates.push({
          entries: [entryI, entryJ],
          similarity,
        })
      }
    }
  }

  return duplicates
}

/**
 * Calculate simple similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = getEditDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

/**
 * Calculate edit distance (Levenshtein distance)
 */
function getEditDistance(str1: string, str2: string): number {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0)
  const costs: number[] = []
  for (let i = 0; i <= str1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= str2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1] as number
        if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j] as number) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) {
      costs[str2.length] = lastValue
    }
  }
  return costs[str2.length] as number
}

/**
 * Merge two movie entries
 */
export function mergeMovieEntries(entry1: MovieEntry, entry2: MovieEntry): MovieEntry {
  // Prefer entry with real IMDB ID
  const primary = entry1.movieId.startsWith('tt') ? entry1 : entry2
  const secondary = primary === entry1 ? entry2 : entry1

  // Merge sources
  const mergedSources = [...primary.sources]

  for (const secondarySource of secondary.sources) {
    const existingIndex = mergedSources.findIndex(
      s => s.type === secondarySource.type && s.id === secondarySource.id
    )

    const existingSource = mergedSources[existingIndex]
    if (existingIndex !== -1 && existingSource) {
      // Update existing source with new data
      const updatedSource = {
        ...existingSource,
        ...secondarySource,
        description: secondarySource.description || existingSource.description,
      }

      // Normalize language field for type compatibility
      if ('language' in updatedSource && updatedSource.language) {
        updatedSource.language = normalizeLanguage(updatedSource.language)
      }

      mergedSources[existingIndex] = updatedSource as MovieSource
    } else {
      // Add new source with normalized language
      const normalizedSource = { ...secondarySource }
      if ('language' in normalizedSource && normalizedSource.language) {
        normalizedSource.language = normalizeLanguage(normalizedSource.language)
      }
      mergedSources.push(normalizedSource as MovieSource)
    }
  }

  return {
    ...primary,
    sources: mergedSources,
    metadata: primary.metadata || secondary.metadata,
    year: primary.year || secondary.year,
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * DEPRECATED: Failed OMDB matches are now tracked in public/data/failed-omdb.json
 * Use functions from server/utils/failedOmdb.ts instead:
 * - saveFailedOmdbMatch(identifier, title, reason)
 * - hasFailedOmdbMatch(identifier)
 * - clearFailedOmdbMatches()
 * - removeFailedOmdbMatch(identifier)
 * - getFailedOmdbMatches()
 */

/**
 * Find duplicate movies grouped by normalized title
 * Returns a Map where keys are normalized titles and values are arrays of movie entries
 */
export function findDuplicates(db: MoviesDatabase): Map<string, MovieEntry[]> {
  const entries = Object.entries(db)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, entry]) => entry as MovieEntry)

  const titleGroups = new Map<string, MovieEntry[]>()

  for (const entry of entries) {
    const normalized = normalizeTitleForComparison(entry.title)
    if (!titleGroups.has(normalized)) {
      titleGroups.set(normalized, [])
    }
    titleGroups.get(normalized)!.push(entry)
  }

  // Filter to only groups with more than one entry
  const duplicates = new Map<string, MovieEntry[]>()
  for (const [title, entries] of titleGroups) {
    if (entries.length > 1) {
      duplicates.set(title, entries)
    }
  }

  return duplicates
}

/**
 * Merge duplicate movies using smart strategy
 * Priority: IMDB ID > OMDB enriched > has metadata > more sources
 */
export function mergeDuplicates(
  duplicates: MovieEntry[],
  mode: 'auto' | 'interactive'
): MovieEntry {
  if (duplicates.length === 0) {
    throw new Error('Cannot merge empty duplicates array')
  }

  const firstEntry = duplicates[0]
  if (!firstEntry) {
    throw new Error('First duplicate entry is undefined')
  }

  if (duplicates.length === 1) {
    return firstEntry
  }

  // In interactive mode, just return the first (API will handle selection)
  if (mode === 'interactive') {
    return firstEntry
  }

  // Auto mode: use smart merge strategy
  let best: MovieEntry = firstEntry
  let bestScore = 0

  for (const entry of duplicates) {
    let score = 0

    // Prefer entries with real IMDB IDs
    if (entry.movieId.startsWith('tt')) score += 100

    // Prefer entries with OMDB metadata
    if (entry.metadata) score += 50

    // Prefer entries with more sources
    score += entry.sources.length * 5

    // Prefer entries with year
    if (entry.year) score += 10

    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  // Merge sources from all duplicates
  const mergedSources = [...best.sources]
  const seenSources = new Set<string>()

  // Track existing sources
  for (const source of best.sources) {
    const key = source.type === 'archive.org' ? `archive:${source.id}` : `youtube:${source.id}`
    seenSources.add(key)
  }

  // Add sources from other duplicates
  for (const entry of duplicates) {
    if (entry.movieId === best.movieId) continue

    for (const source of entry.sources) {
      const key = source.type === 'archive.org' ? `archive:${source.id}` : `youtube:${source.id}`

      if (!seenSources.has(key)) {
        mergedSources.push(source)
        seenSources.add(key)
      }
    }
  }

  return {
    ...best,
    sources: mergedSources,
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Generate a unique movie ID from title
 */
export function generateMovieId(title: string, existingIds: Set<string>): string {
  // Create slug from title
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)

  // Try base slug first
  const id = `temp-${slug}`
  if (!existingIds.has(id)) {
    return id
  }

  // Add counter if needed
  let counter = 1
  while (existingIds.has(`${id}-${counter}`)) {
    counter++
  }

  return `${id}-${counter}`
}

/**
 * Remove movies with duplicate IDs (keep first occurrence)
 */
export function removeDuplicateIds(db: MoviesDatabase): { removed: string[]; kept: string[] } {
  const seen = new Set<string>()
  const removed: string[] = []
  const kept: string[] = []

  const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))

  for (const [key, entry] of entries) {
    const movieEntry = entry as MovieEntry
    const id = movieEntry.movieId

    if (seen.has(id)) {
      // Duplicate ID - remove this entry
      delete db[key]
      removed.push(key)
    } else {
      // First occurrence - keep it
      seen.add(id)
      kept.push(key)
    }
  }

  return { removed, kept }
}

/**
 * Find orphaned poster files (files not referenced by any movie)
 */
export async function findOrphanedPosters(db: MoviesDatabase): Promise<string[]> {
  try {
    const { readdir } = await import('fs/promises')
    const { join } = await import('path')

    const postersDir = join(process.cwd(), 'public/posters')

    // Check if directory exists
    try {
      const files = await readdir(postersDir)

      // Get all movie IDs that should have posters (IMDB IDs)
      const expectedPosters = new Set<string>()
      const entries = Object.entries(db).filter(([key]) => !key.startsWith('_'))

      for (const [_, entry] of entries) {
        const movieEntry = entry as MovieEntry
        // All movies with IMDB IDs should have posters
        if (movieEntry.movieId.startsWith('tt')) {
          expectedPosters.add(`${movieEntry.movieId}.jpg`)
        }
      }

      // Find files not expected (orphaned posters)
      const orphaned: string[] = []
      for (const file of files) {
        if (file === '.gitkeep') continue
        if (!expectedPosters.has(file)) {
          orphaned.push(file)
        }
      }

      return orphaned
    } catch (error: unknown) {
      // Directory doesn't exist or can't be read
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }
  } catch (error) {
    console.error('Failed to find orphaned posters:', error)
    return []
  }
}
