import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { getAdminDatabase } from './adminDb'
import { createLogger } from './logger'

const logger = createLogger('PosterCleanup')

const POSTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const SAMPLE_LIMIT = 20

export type PosterCleanupScope = 'listed' | 'admin'

export interface CleanupUnlistedPostersOptions {
  dryRun?: boolean
  scope?: PosterCleanupScope
  postersDir?: string
}

export interface CleanupUnlistedPostersResult {
  removedCount: number
  freedBytes: number
  remainingCount: number
  totalScanned: number
  scope: PosterCleanupScope
  dryRun: boolean
  sampleRemovedIds: string[]
}

const LISTED_MOVIES_QUERY = `
  SELECT DISTINCT m.movieId
  FROM movies m
  WHERE EXISTS (
    SELECT 1 FROM sources s
    WHERE s.movieId = m.movieId
    AND (
      s.status IN ('active', 'unlisted')
      OR (s.status = 'unavailable' AND s.unavailableReason IN ('not_embeddable', 'age_restricted'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM source_quality_marks sqm
      WHERE sqm.sourceId = s.id
    )
  )
`

const ALL_MOVIES_QUERY = `
  SELECT movieId
  FROM movies
`

function getValidMovieIds(scope: PosterCleanupScope): Set<string> {
  const adminDb = getAdminDatabase()
  const query = scope === 'admin' ? ALL_MOVIES_QUERY : LISTED_MOVIES_QUERY
  const rows = adminDb.prepare(query).all() as Array<{ movieId: string }>
  return new Set(rows.map(row => row.movieId))
}

export function cleanupUnlistedPosters(
  options: CleanupUnlistedPostersOptions = {}
): CleanupUnlistedPostersResult {
  const dryRun = options.dryRun ?? false
  const scope: PosterCleanupScope = options.scope ?? 'listed'
  const postersDir = options.postersDir ?? join(process.cwd(), 'public/posters')

  const validMovieIds = getValidMovieIds(scope)

  if (validMovieIds.size === 0) {
    throw new Error(`Refusing to clean up posters: valid movie set for scope "${scope}" is empty`)
  }

  if (!existsSync(postersDir)) {
    logger.warn(`Posters directory does not exist: ${postersDir}`)
    return {
      removedCount: 0,
      freedBytes: 0,
      remainingCount: 0,
      totalScanned: 0,
      scope,
      dryRun,
      sampleRemovedIds: [],
    }
  }

  const entries = readdirSync(postersDir, { withFileTypes: true })
  const posterFiles: Array<{ movieId: string; path: string }> = []

  for (const entry of entries) {
    if (!entry.isFile() || entry.name === '.gitkeep') {
      continue
    }
    const ext = extname(entry.name)
    if (!POSTER_EXTENSIONS.has(ext.toLowerCase())) {
      continue
    }
    const movieId = basename(entry.name, ext)
    posterFiles.push({
      movieId,
      path: join(postersDir, entry.name),
    })
  }

  const orphanedFiles = posterFiles.filter(file => !validMovieIds.has(file.movieId))

  let freedBytes = 0
  for (const file of orphanedFiles) {
    try {
      freedBytes += statSync(file.path).size
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }

  if (!dryRun) {
    for (const file of orphanedFiles) {
      try {
        unlinkSync(file.path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err
        }
      }
    }
  }

  const totalScanned = posterFiles.length
  const removedCount = orphanedFiles.length
  const remainingCount = totalScanned - removedCount
  const sampleRemovedIds = orphanedFiles.slice(0, SAMPLE_LIMIT).map(file => file.movieId)

  logger.info(
    `${dryRun ? '[DRY RUN] ' : ''}Scanned ${totalScanned} posters (scope=${scope}): ` +
      `${removedCount} ${dryRun ? 'would be removed' : 'removed'}, ` +
      `${(freedBytes / 1024 / 1024).toFixed(2)} MB, ${remainingCount} remaining`
  )

  return {
    removedCount,
    freedBytes,
    remainingCount,
    totalScanned,
    scope,
    dryRun,
    sampleRemovedIds,
  }
}
