/**
 * Automated Movie Matching, False-Hit Remediation & Archive.org Preview Cleanup Pipeline
 *
 * Shared by both CLI (`scripts/auto-pipeline.ts`) and Admin API (`server/api/admin/auto/run.post.ts`).
 * Emits real-time SSE progress via `emitProgress({ type: 'audit', ... })`.
 */

import 'dotenv/config'
import type Database from 'better-sqlite3'
import { ensureMatchAttemptsTable, getAdminDatabase, withTransaction } from './adminDb'
import { analyzeArchiveSourceSize } from './archivePreviewDetector'
import {
  extractImdbIdFromText,
  retrieveCandidates,
  type RetrievedCandidate,
} from './candidateRetriever'
import { getImdbLocalById, isImdbLocalIndexAvailable } from './imdbLocalIndex'
import {
  ensureMatchReviewQueueTable,
  enqueueReviewItem,
  resolveReviewItem,
} from './matchReviewQueue'
import { extractYearFromTitle, parseRuntimeMinutes, scoreMatchCandidate } from './matchScorer'
import {
  adjudicateCandidates,
  planMatchQueries,
  verifyMatchCandidate,
  type VerifierCandidateInput,
} from './matchVerifier'
import { migrateMovieId } from './migrateMovieId'
import { getMovieByImdbId } from './omdb'
import { emitProgress } from './progress'
import { isSearxngAvailable, searchSearxngRawForImdb } from './searxngSearch'
import { extractSourceMetadata } from './sourceMetadataExtractor'
import { generateArchiveId, generateYouTubeId, isImdbId } from '../../shared/types/movie'
import type { MovieMetadata } from '../../shared/types/movie'

export interface AutoCleanPreviewsOptions {
  dryRun?: boolean
  limit?: number
  removeRedundant?: boolean
}

export interface AutoCleanPreviewsResult {
  task: 'clean_previews'
  dryRun: boolean
  scannedMovies: number
  scannedSources: number
  removedRedundant: number
  markedIncomplete: number
  skippedCartoons: number
  queuedBorderline: number
  samples: Array<{
    movieId: string
    sourceId: string
    title: string
    action: 'remove_redundant' | 'mark_incomplete' | 'queue_borderline'
    sizeMB: number | null
    runtimeMin: number | null
    mbPerMin: number | null
    flags: string[]
  }>
}

export interface AutoAuditFalseHitsOptions {
  dryRun?: boolean
  limit?: number
  includeVerified?: boolean
  minConfidence?: number
  rematch?: boolean
  allowGoogle?: boolean
  model?: string
  concurrency?: number
}

export interface AutoAuditFalseHitsResult {
  task: 'audit_false_hits'
  dryRun: boolean
  scanned: number
  deterministicFlagged: number
  llmKept: number
  autoRematched: number
  autoUnmatched: number
  queuedUncertain: number
  errors: number
  samples: Array<{
    movieId: string
    title: string
    action: 'kept' | 'rematched' | 'unmatched' | 'queued'
    newMovieId?: string
    llmVerdict: string
    llmConfidence: number
    llmReason: string
    flags: string[]
  }>
}

export interface AutoResolveFalseHitQueueOptions {
  dryRun?: boolean
  limit?: number
  minConfidence?: number
  rematch?: boolean
  allowGoogle?: boolean
  model?: string
}

export interface AutoResolveFalseHitQueueResult {
  task: 'resolve_false_hit_queue'
  dryRun: boolean
  scanned: number
  autoKept: number
  autoRematched: number
  autoUnmatched: number
  stillUncertain: number
  alreadyResolved: number
  errors: number
  samples: Array<{
    queueId: number
    movieId: string
    title: string
    action: 'kept' | 'rematched' | 'unmatched' | 'uncertain' | 'already_resolved'
    newMovieId?: string
    llmVerdict: string
    llmConfidence: number
    llmReason: string
  }>
}

export interface AutoMatchUnmatchedOptions {
  dryRun?: boolean
  limit?: number
  channel?: string
  minConfidence?: number
  allowGoogle?: boolean
  model?: string
  skipAttempted?: boolean
  retryAfterDays?: number
  concurrency?: number
}

export interface AutoMatchUnmatchedResult {
  task: 'match_unmatched'
  dryRun: boolean
  scanned: number
  directUrlMatches: number
  deterministicMatches: number
  llmMatches: number
  plannedLlmMatches?: number
  notAMovie?: number
  queuedUncertain: number
  noMatch: number
  errors: number
  samples: Array<{
    oldMovieId: string
    title: string
    action: 'direct_match' | 'deterministic_match' | 'llm_match' | 'queued' | 'no_match'
    imdbId?: string
    matchedTitle?: string
    confidence?: number
    reason?: string
  }>
}

function createDbWriteSerializer(): <T>(fn: () => Promise<T> | T) => Promise<T> {
  let chain: Promise<void> = Promise.resolve()
  return async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = chain.then(() => fn())
    chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  const safeConcurrency = Math.min(Math.max(Math.floor(concurrency) || 1, 1), 10)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= items.length) break
      await worker(items[currentIndex]!, currentIndex)
    }
  })
  await Promise.all(workers)
}

async function fetchOmdbCached(
  imdbId: string,
  omdbApiKey?: string,
  omdbCache?: Map<string, MovieMetadata | null>
): Promise<MovieMetadata | null> {
  if (!omdbApiKey) return null
  const key = imdbId.toLowerCase()
  if (omdbCache?.has(key)) {
    return omdbCache.get(key) ?? null
  }
  const meta = await getMovieByImdbId(imdbId, omdbApiKey).catch(() => null)
  omdbCache?.set(key, meta)
  return meta
}

/**
 * Hydrate top candidates with local IMDb metadata (free) and OMDb plot/director/cast
 * before sending them to the LLM adjudicator, preventing title-only guessing and false positives.
 */
async function hydrateCandidatesForAdjudication(
  candidates: RetrievedCandidate[],
  omdbApiKey?: string,
  omdbCache?: Map<string, MovieMetadata | null>
): Promise<VerifierCandidateInput[]> {
  const localAvailable = isImdbLocalIndexAvailable()

  // Step 1: Fill missing fields from local IMDb index (free, ~1ms)
  const hydrated = candidates.map(c => {
    const copy: RetrievedCandidate = {
      ...c,
      altTitles: [...c.altTitles],
      directors: [...c.directors],
      cast: [...c.cast],
      sources: [...c.sources],
    }
    if (
      localAvailable &&
      (!copy.year || !copy.runtimeMinutes || copy.directors.length === 0 || copy.cast.length === 0)
    ) {
      const local = getImdbLocalById(copy.imdbId)
      if (local) {
        if (!copy.year && local.year) copy.year = local.year
        if (!copy.runtimeMinutes && local.runtimeMinutes) copy.runtimeMinutes = local.runtimeMinutes
        if (!copy.titleType && local.titleType) copy.titleType = local.titleType
        if (copy.directors.length === 0 && local.directors.length > 0) {
          copy.directors = local.directors
        }
        if (copy.cast.length === 0 && local.cast.length > 0) {
          copy.cast = local.cast
        }
      }
    }
    return copy
  })

  // Step 2: Hydrate missing plot/director/actors from OMDb in parallel for top 3 candidates
  if (omdbApiKey) {
    const needsOmdb = hydrated
      .slice(0, 3)
      .filter(c => !c.overview || c.directors.length === 0 || c.cast.length === 0)
    if (needsOmdb.length > 0) {
      await Promise.allSettled(
        needsOmdb.map(async c => {
          const meta = await fetchOmdbCached(c.imdbId, omdbApiKey, omdbCache)
          if (!meta) return
          if (!c.overview && meta.Plot && meta.Plot !== 'N/A') {
            c.overview = meta.Plot
          }
          if (!c.runtimeMinutes) {
            const rt = parseRuntimeMinutes(meta.Runtime)
            if (rt) c.runtimeMinutes = rt
          }
          if (!c.year && meta.Year) {
            const y = parseInt(meta.Year.slice(0, 4), 10)
            if (!Number.isNaN(y)) c.year = y
          }
          if (c.directors.length === 0 && meta.Director && meta.Director !== 'N/A') {
            c.directors = meta.Director.split(',')
              .map(s => s.trim())
              .filter(Boolean)
          }
          if (c.cast.length === 0 && meta.Actors && meta.Actors !== 'N/A') {
            c.cast = meta.Actors.split(',')
              .map(s => s.trim())
              .filter(Boolean)
          }
          if (!c.titleType && meta.Type) {
            c.titleType = meta.Type
          }
        })
      )
    }
  }

  return hydrated.map(c => ({
    imdbId: c.imdbId,
    title: c.title,
    year: c.year ?? null,
    runtimeMin: c.runtimeMinutes ?? null,
    director: c.directors.join(', ') || null,
    actors: c.cast.join(', ') || null,
    plot: c.overview ?? null,
    type: c.titleType ?? null,
  }))
}

interface SourceRow {
  id: number
  movieId: string
  sourceId: string
  channelId: string
  platform: string
  channelName: string
  title: string | null
  description: string | null
  size: number | null
  duration: number | null
  year: number | null
  isIncomplete?: number
}

function ensureAuditAttemptsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_attempts (
      movieId TEXT PRIMARY KEY,
      auditedAt TEXT NOT NULL,
      outcome TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_attempts_auditedAt ON audit_attempts(auditedAt);
  `)
}

function computeEtaSeconds(
  startedAtMs: number,
  completed: number,
  total: number
): number | undefined {
  if (completed < 1 || total <= completed) return undefined
  const elapsedMs = Date.now() - startedAtMs
  const remainingMs = (elapsedMs / completed) * (total - completed)
  return Math.max(1, Math.round(remainingMs / 1000))
}

function upsertMetadataAndMovie(db: Database.Database, imdbId: string, meta: MovieMetadata): void {
  const now = new Date().toISOString()
  const yearNum = meta.Year ? parseInt(meta.Year.slice(0, 4), 10) : null
  const validYear = yearNum && !Number.isNaN(yearNum) ? yearNum : null

  db.prepare(
    `UPDATE movies
     SET title = COALESCE(?, title),
         year = COALESCE(?, year),
         lastUpdated = ?
     WHERE movieId = ?`
  ).run(meta.Title || null, validYear, now, imdbId)

  db.prepare(
    `INSERT INTO metadata (
      movieId, Title, Year, Rated, Runtime, Genre, Director, Writer, Actors,
      Plot, Language, Country, Awards, imdbRating, imdbVotes, imdbID, Type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(movieId) DO UPDATE SET
      Title = excluded.Title,
      Year = excluded.Year,
      Rated = excluded.Rated,
      Runtime = excluded.Runtime,
      Genre = excluded.Genre,
      Director = excluded.Director,
      Writer = excluded.Writer,
      Actors = excluded.Actors,
      Plot = excluded.Plot,
      Language = excluded.Language,
      Country = excluded.Country,
      Awards = excluded.Awards,
      imdbRating = excluded.imdbRating,
      imdbVotes = excluded.imdbVotes,
      imdbID = excluded.imdbID,
      Type = excluded.Type`
  ).run(
    imdbId,
    meta.Title ?? null,
    meta.Year ?? null,
    meta.Rated ?? null,
    meta.Runtime ?? null,
    meta.Genre ?? null,
    meta.Director ?? null,
    meta.Writer ?? null,
    meta.Actors ?? null,
    meta.Plot ?? null,
    meta.Language ?? null,
    meta.Country ?? null,
    meta.Awards ?? null,
    meta.imdbRating ?? null,
    meta.imdbVotes ?? null,
    meta.imdbID ?? imdbId,
    meta.Type ?? 'movie'
  )
}

interface FindReplacementImdbMatchInput {
  movieId: string
  rawTitle: string
  description?: string | null
  sourceId: string
  platform: string
  channelId: string
  channelName: string
  sourceYear?: number | null
  movieYear?: number | null
  sourceDurationMin: number | null
  excludeImdbId: string
}

interface FindReplacementImdbMatchOptions {
  minRematchConfidence?: number
  allowGoogle?: boolean
  model?: string
  omdbApiKey?: string
}

interface FindReplacementImdbMatchResult {
  imdbId: string
  meta: MovieMetadata | null
  confidence: number
  reason: string
}

/**
 * Shared Phase 1 + Phase 2 LLM rematch helper (excludes `excludeImdbId`).
 */
async function findReplacementImdbMatch(
  input: FindReplacementImdbMatchInput,
  options: FindReplacementImdbMatchOptions = {}
): Promise<FindReplacementImdbMatchResult | null> {
  const minRematchConfidence = options.minRematchConfidence ?? 0.85
  const allowGoogle = options.allowGoogle ?? false
  const model = options.model || 'google/gemini-2.5-flash-lite'
  const omdbApiKey = options.omdbApiKey ?? process.env.OMDB_API_KEY
  const excludedIdLower = input.excludeImdbId.toLowerCase()

  const extracted = extractSourceMetadata({
    rawTitle: input.rawTitle,
    description: input.description,
    sourceId: input.sourceId,
    platform: input.platform,
    channelId: input.channelId,
    channelName: input.channelName,
  })
  const queryTitle = extracted.cleanTitle || input.rawTitle
  const queryYear =
    extracted.year ??
    input.sourceYear ??
    (input.platform === 'archive.org' && input.movieYear && input.movieYear < 2020
      ? input.movieYear
      : undefined)

  const rejectedIds = new Set<string>([excludedIdLower])
  const rejectedSummaries: Array<{ imdbId: string; title: string; year: number | null }> = []
  const omdbCache = new Map<string, MovieMetadata | null>()

  // Phase 1: Multi-source retrieval + deterministic scoring + hydrated LLM adjudication
  const candidates = (
    await retrieveCandidates(
      {
        title: queryTitle,
        originalTitle: extracted.originalTitle,
        altTitles: extracted.altTitles,
        year: queryYear,
        description: input.description || undefined,
        director: extracted.director,
        cast: extracted.cast,
      },
      { limit: 8, omdbApiKey, allowGoogleFallback: allowGoogle }
    )
  ).filter(c => c.imdbId.toLowerCase() !== excludedIdLower)

  if (candidates.length > 0) {
    const scored = candidates
      .map(cand => ({
        cand,
        result: scoreMatchCandidate(
          {
            title: queryTitle,
            originalTitle: extracted.originalTitle ?? null,
            altTitles: extracted.altTitles,
            sourceYear: queryYear ?? null,
            titleYear: extracted.year ?? null,
            sourceDurationMin: input.sourceDurationMin,
            director: extracted.director ?? null,
            cast: extracted.cast,
          },
          {
            imdbId: cand.imdbId,
            title: cand.title,
            originalTitle: cand.originalTitle,
            altTitles: cand.altTitles,
            year: cand.year ?? null,
            runtimeMin: cand.runtimeMinutes ?? null,
            director: cand.directors.join(', ') || null,
            cast: cand.cast,
            type: cand.titleType ?? null,
          }
        ),
      }))
      .sort((a, b) => b.result.score - a.result.score)

    const nonRejected = scored.filter(s => s.result.tier !== 'reject').slice(0, 5)
    const adjudicateList = [...nonRejected]
    if (adjudicateList.length < 3) {
      const existingIds = new Set(adjudicateList.map(s => s.cand.imdbId))
      const fallbackCandidates = scored.filter(
        s =>
          !existingIds.has(s.cand.imdbId) &&
          !s.result.flags.includes('runtime_feature_short_mismatch') &&
          !s.result.flags.includes('non_movie_candidate')
      )
      for (const fc of fallbackCandidates) {
        if (adjudicateList.length >= 5) break
        adjudicateList.push(fc)
      }
    }

    if (adjudicateList.length > 0) {
      const hydratedInputs = await hydrateCandidatesForAdjudication(
        adjudicateList.map(s => s.cand),
        omdbApiKey,
        omdbCache
      )
      const adj = await adjudicateCandidates(
        {
          movieId: input.movieId,
          sourceId: input.sourceId,
          title: input.rawTitle,
          originalTitle: extracted.originalTitle ?? null,
          altTitles: extracted.altTitles,
          year: queryYear ?? null,
          durationMin: input.sourceDurationMin,
          director: extracted.director ?? null,
          cast: extracted.cast,
          description: input.description,
          channelName: input.channelName,
        },
        hydratedInputs,
        { model }
      )

      if (
        adj.chosenImdbId &&
        adj.verdict === 'match' &&
        adj.confidence >= minRematchConfidence &&
        adj.chosenImdbId.toLowerCase() !== excludedIdLower
      ) {
        const meta = await fetchOmdbCached(adj.chosenImdbId, omdbApiKey, omdbCache)
        const runtimeCheck = scoreMatchCandidate(
          { title: queryTitle, sourceDurationMin: input.sourceDurationMin },
          {
            imdbId: adj.chosenImdbId,
            title: meta?.Title || adj.chosenImdbId,
            runtimeMin: parseRuntimeMinutes(meta?.Runtime),
          }
        )
        if (
          !runtimeCheck.flags.includes('runtime_feature_short_mismatch') &&
          !runtimeCheck.flags.includes('runtime_major_mismatch')
        ) {
          return {
            imdbId: adj.chosenImdbId,
            meta,
            confidence: adj.confidence,
            reason: adj.reason,
          }
        }
      }

      if (!adj.reason.startsWith('Adjudication error:')) {
        for (const s of adjudicateList) {
          rejectedIds.add(s.cand.imdbId.toLowerCase())
          rejectedSummaries.push({
            imdbId: s.cand.imdbId,
            title: s.cand.title,
            year: s.cand.year ?? null,
          })
        }
      }
    }
  }

  // Phase 2: LLM Query Planner + Multi-Query Fan-out + SearXNG
  const plan = await planMatchQueries(
    {
      movieId: input.movieId,
      sourceId: input.sourceId,
      title: input.rawTitle,
      originalTitle: extracted.originalTitle ?? null,
      altTitles: extracted.altTitles,
      year: queryYear ?? null,
      durationMin: input.sourceDurationMin,
      director: extracted.director ?? null,
      cast: extracted.cast,
      description: input.description,
      channelName: input.channelName,
    },
    rejectedSummaries,
    { model }
  )

  if (!plan || !plan.isMovie) {
    return null
  }

  const plannedYear = plan.year ?? queryYear
  const plannedTitle = plan.englishTitle || plan.cleanTitle || plan.originalTitle || queryTitle
  const plannedAlts = Array.from(
    new Set(
      [plan.cleanTitle, plan.originalTitle, plan.englishTitle, ...plan.searchQueries].filter(
        (t): t is string => Boolean(t && t.trim())
      )
    )
  )
  const plannedDirector = plan.director || extracted.director
  const plannedCast = plan.cast.length > 0 ? plan.cast : extracted.cast

  const [plannedCandidates, searxSettled] = await Promise.all([
    retrieveCandidates(
      {
        title: plannedTitle,
        originalTitle: plan.originalTitle || extracted.originalTitle,
        altTitles: plannedAlts,
        year: plannedYear,
        description: input.description || undefined,
        director: plannedDirector,
        cast: plannedCast,
      },
      { limit: 8, omdbApiKey, allowGoogleFallback: allowGoogle }
    ),
    isSearxngAvailable() && plan.webQueries.length > 0
      ? Promise.allSettled(
          plan.webQueries.slice(0, 2).map(wq => searchSearxngRawForImdb(wq, 4).catch(() => []))
        )
      : Promise.resolve([]),
  ])

  const freshMap = new Map<string, RetrievedCandidate>()
  for (const c of plannedCandidates) {
    if (!rejectedIds.has(c.imdbId.toLowerCase())) {
      freshMap.set(c.imdbId.toLowerCase(), c)
    }
  }

  for (const res of searxSettled) {
    if (res.status !== 'fulfilled') continue
    for (const hit of res.value) {
      const hitId = hit.imdbId.toLowerCase()
      if (rejectedIds.has(hitId) || freshMap.has(hitId)) continue
      freshMap.set(hitId, {
        imdbId: hit.imdbId,
        title: hit.title,
        altTitles: [],
        year: hit.year,
        directors: [],
        cast: [],
        overview: hit.snippet,
        sources: ['searxng'],
      })
    }
  }

  const freshList = Array.from(freshMap.values())
  if (freshList.length === 0) {
    return null
  }

  const scoredFresh = freshList
    .map(cand => ({
      cand,
      result: scoreMatchCandidate(
        {
          title: plannedTitle,
          originalTitle: plan.originalTitle ?? extracted.originalTitle ?? null,
          altTitles: plannedAlts,
          sourceYear: plannedYear ?? null,
          titleYear: plan.year ?? extracted.year ?? null,
          sourceDurationMin: input.sourceDurationMin,
          director: plannedDirector ?? null,
          cast: plannedCast,
        },
        {
          imdbId: cand.imdbId,
          title: cand.title,
          originalTitle: cand.originalTitle,
          altTitles: cand.altTitles,
          year: cand.year ?? null,
          runtimeMin: cand.runtimeMinutes ?? null,
          director: cand.directors.join(', ') || null,
          cast: cand.cast,
          type: cand.titleType ?? null,
        }
      ),
    }))
    .filter(
      s =>
        !s.result.flags.includes('runtime_feature_short_mismatch') &&
        !s.result.flags.includes('non_movie_candidate')
    )
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 5)

  if (scoredFresh.length === 0) {
    return null
  }

  const hydratedFresh = await hydrateCandidatesForAdjudication(
    scoredFresh.map(s => s.cand),
    omdbApiKey,
    omdbCache
  )
  const adj2 = await adjudicateCandidates(
    {
      movieId: input.movieId,
      sourceId: input.sourceId,
      title: input.rawTitle,
      originalTitle: plan.originalTitle ?? extracted.originalTitle ?? null,
      altTitles: plannedAlts,
      year: plannedYear ?? null,
      durationMin: input.sourceDurationMin,
      director: plannedDirector ?? null,
      cast: plannedCast,
      description: input.description,
      channelName: input.channelName,
    },
    hydratedFresh,
    { model }
  )

  if (
    adj2.chosenImdbId &&
    adj2.verdict === 'match' &&
    adj2.confidence >= minRematchConfidence &&
    adj2.chosenImdbId.toLowerCase() !== excludedIdLower
  ) {
    const meta = await fetchOmdbCached(adj2.chosenImdbId, omdbApiKey, omdbCache)
    const runtimeCheck = scoreMatchCandidate(
      { title: plannedTitle, sourceDurationMin: input.sourceDurationMin },
      {
        imdbId: adj2.chosenImdbId,
        title: meta?.Title || adj2.chosenImdbId,
        runtimeMin: parseRuntimeMinutes(meta?.Runtime),
      }
    )
    if (
      !runtimeCheck.flags.includes('runtime_feature_short_mismatch') &&
      !runtimeCheck.flags.includes('runtime_major_mismatch')
    ) {
      return {
        imdbId: adj2.chosenImdbId,
        meta,
        confidence: adj2.confidence,
        reason: adj2.reason,
      }
    }
  }

  return null
}

function isHealthySiblingSource(
  source: SourceRow,
  runtimeMin: number | null,
  excludeId: number
): boolean {
  if (source.id === excludeId) return false
  if (source.platform === 'youtube') {
    return !source.duration || source.duration >= 2400
  }
  if (source.size === null || source.size <= 0) return false
  const sizeMB = source.size / (1024 * 1024)
  if (sizeMB < 100) return false
  if (runtimeMin && runtimeMin > 0 && sizeMB / runtimeMin < 1.5) return false
  return true
}

/**
 * 1. Automated Archive.org Preview / Trailer / Subtitles Cleaner
 * Uses film length + file size (MB/min) so legit cartoons/shorts (<30m, >=10MB) are protected.
 */
export async function runAutoCleanArchivePreviews(
  options: AutoCleanPreviewsOptions = {}
): Promise<AutoCleanPreviewsResult> {
  const dryRun = options.dryRun ?? true
  const removeRedundant = options.removeRedundant ?? false
  const safeLimit = Math.max(1, Math.min(25000, Number(options.limit) || 5000))
  const db = getAdminDatabase()

  const movies = db
    .prepare(
      `SELECT DISTINCT m.movieId, m.title, md.Runtime as omdbRuntime
       FROM movies m
       JOIN sources s ON m.movieId = s.movieId
       LEFT JOIN metadata md ON m.movieId = md.movieId
       WHERE m.movieId LIKE 'tt%'
         AND s.channelId = 'archive.org'
         AND NOT EXISTS (
           SELECT 1 FROM source_quality_marks sqm
           WHERE sqm.sourceId = s.id AND sqm.mark = 'incomplete'
         )
         AND (
           s.size IS NOT NULL AND s.size < 104857600
           OR lower(coalesce(s.title, '')) LIKE '%trailer%'
           OR lower(coalesce(s.title, '')) LIKE '%preview%'
           OR lower(coalesce(s.title, '')) LIKE '%tv spot%'
           OR lower(coalesce(s.title, '')) LIKE '%subtitles%'
           OR lower(coalesce(s.sourceId, '')) LIKE '%trailer%'
           OR lower(coalesce(s.sourceId, '')) LIKE '%preview%'
         )
       LIMIT ?`
    )
    .all(safeLimit) as Array<{ movieId: string; title: string; omdbRuntime: string | null }>

  const getSourcesStmt = db.prepare(
    `SELECT s.id, s.movieId, s.sourceId, s.channelId, c.platform, c.name as channelName,
            s.title, s.description, s.size, s.duration, s.year,
            EXISTS (
              SELECT 1 FROM source_quality_marks sqm
              WHERE sqm.sourceId = s.id AND sqm.mark = 'incomplete'
            ) as isIncomplete
     FROM sources s
     JOIN channels c ON s.channelId = c.id
     WHERE s.movieId = ?`
  )

  const total = movies.length
  let scannedMovies = 0
  let scannedSources = 0
  let removedRedundant = 0
  let markedIncomplete = 0
  let skippedCartoons = 0
  let queuedBorderline = 0
  const samples: AutoCleanPreviewsResult['samples'] = []
  const now = new Date().toISOString()

  emitProgress({
    type: 'audit',
    status: 'starting',
    current: 0,
    total,
    message: `Starting ${dryRun ? 'dry-run ' : ''}Archive.org preview cleanup (${total} candidate movies)...`,
    successCurrent: 0,
    failedCurrent: 0,
  })

  const startedAt = Date.now()

  try {
    for (const movie of movies) {
      scannedMovies++
      if (scannedMovies === 1 || scannedMovies % 25 === 0 || scannedMovies === total) {
        emitProgress({
          type: 'audit',
          status: 'in_progress',
          current: scannedMovies,
          total,
          message: `Cleaning Archive previews: ${movie.title} (removed: ${removedRedundant}, marked: ${markedIncomplete})`,
          successCurrent: removedRedundant + markedIncomplete,
          failedCurrent: queuedBorderline,
          estimatedTimeRemaining: computeEtaSeconds(startedAt, scannedMovies - 1, total),
        })
      }

      const runtimeMin = parseRuntimeMinutes(movie.omdbRuntime)
      const allSources = getSourcesStmt.all(movie.movieId) as SourceRow[]
      const archiveSources = allSources.filter(
        s => s.channelId === 'archive.org' && !s.isIncomplete
      )

      for (const src of archiveSources) {
        scannedSources++
        const analysis = analyzeArchiveSourceSize({
          sourceId: src.sourceId,
          title: src.title,
          description: src.description,
          sizeBytes: src.size,
          runtimeMinutes: runtimeMin,
          durationSeconds: src.duration,
        })

        // Explicitly track protected short cartoons
        if (
          !analysis.isLikelyPreview &&
          runtimeMin !== null &&
          runtimeMin < 30 &&
          analysis.sizeMB !== null &&
          analysis.sizeMB >= 10
        ) {
          skippedCartoons++
          continue
        }

        if (!analysis.isLikelyPreview) continue

        const hasKeyword = analysis.flags.includes('preview_keyword')
        const isTiny = analysis.sizeMB !== null && analysis.sizeMB < 5
        const isVeryLowRatioFeature =
          runtimeMin !== null &&
          runtimeMin >= 50 &&
          analysis.mbPerMin !== null &&
          (analysis.mbPerMin < 0.5 || (analysis.mbPerMin < 0.8 && hasKeyword))

        const isHighConfidencePreview = isTiny || isVeryLowRatioFeature
        const hasHealthySibling = allSources.some(other =>
          isHealthySiblingSource(other, runtimeMin, src.id)
        )

        if (!isHighConfidencePreview) {
          queuedBorderline++
          if (!dryRun) {
            enqueueReviewItem(db, {
              movieId: movie.movieId,
              kind: 'archive_preview',
              sourceId: src.sourceId,
              currentImdbId: movie.movieId,
              proposedImdbId: null,
              score: analysis.mbPerMin,
              flags: analysis.flags,
              candidate: {
                sourceTitle: src.title,
                omdbTitle: movie.title,
                sizeMB: analysis.sizeMB,
                runtimeMinutes: analysis.runtimeMinutes,
                mbPerMin: analysis.mbPerMin,
                reason: analysis.reason,
              },
            })
          }
          if (samples.length < 30) {
            samples.push({
              movieId: movie.movieId,
              sourceId: src.sourceId,
              title: src.title || movie.title,
              action: 'queue_borderline',
              sizeMB: analysis.sizeMB,
              runtimeMin,
              mbPerMin: analysis.mbPerMin,
              flags: analysis.flags,
            })
          }
          continue
        }

        if (hasHealthySibling && removeRedundant) {
          removedRedundant++
          if (!dryRun) {
            await withTransaction(async txDb => {
              txDb.prepare('DELETE FROM sources WHERE id = ?').run(src.id)
              txDb
                .prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')
                .run(now, movie.movieId)
            })
          }
          if (samples.length < 30) {
            samples.push({
              movieId: movie.movieId,
              sourceId: src.sourceId,
              title: src.title || movie.title,
              action: 'remove_redundant',
              sizeMB: analysis.sizeMB,
              runtimeMin,
              mbPerMin: analysis.mbPerMin,
              flags: analysis.flags,
            })
          }
        } else {
          markedIncomplete++
          if (!dryRun) {
            await withTransaction(async txDb => {
              txDb
                .prepare(
                  "INSERT OR IGNORE INTO source_quality_marks (sourceId, mark, addedAt) VALUES (?, 'incomplete', ?)"
                )
                .run(src.id, now)
              if (hasKeyword) {
                const label = /\b(trailer|tv\s*spot)\b/i.test(`${src.title || ''} ${src.sourceId}`)
                  ? 'trailer'
                  : 'clip'
                txDb
                  .prepare(
                    'INSERT OR IGNORE INTO movie_quality_labels (movieId, label, addedAt) VALUES (?, ?, ?)'
                  )
                  .run(movie.movieId, label, now)
              }
              txDb
                .prepare('UPDATE movies SET lastUpdated = ? WHERE movieId = ?')
                .run(now, movie.movieId)
            })
          }
          if (samples.length < 30) {
            samples.push({
              movieId: movie.movieId,
              sourceId: src.sourceId,
              title: src.title || movie.title,
              action: 'mark_incomplete',
              sizeMB: analysis.sizeMB,
              runtimeMin,
              mbPerMin: analysis.mbPerMin,
              flags: analysis.flags,
            })
          }
        }
      }
    }

    emitProgress({
      type: 'audit',
      status: 'completed',
      current: scannedMovies,
      total,
      message: `Archive preview cleanup ${dryRun ? '(dry run) ' : ''}complete: ${removedRedundant} removed, ${markedIncomplete} marked, ${queuedBorderline} queued`,
      successCurrent: removedRedundant + markedIncomplete,
      failedCurrent: queuedBorderline,
    })

    return {
      task: 'clean_previews',
      dryRun,
      scannedMovies,
      scannedSources,
      removedRedundant,
      markedIncomplete,
      skippedCartoons,
      queuedBorderline,
      samples,
    }
  } catch (error) {
    emitProgress({
      type: 'audit',
      status: 'error',
      current: scannedMovies,
      total,
      message: error instanceof Error ? error.message : 'Preview cleanup failed',
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * 2. Automated False-Hit Auditor + Auto-Unmatch / Auto-Rematch
 * Pre-filters deterministically, verifies flagged items with gemini-2.5-flash-lite,
 * auto-resolves high-confidence verdicts, and ONLY queues uncertain items.
 */
export async function runAutoAuditFalseHits(
  options: AutoAuditFalseHitsOptions = {}
): Promise<AutoAuditFalseHitsResult> {
  const dryRun = options.dryRun ?? true
  const safeLimit = Math.max(1, Math.min(20000, Number(options.limit) || 500))
  const includeVerified = options.includeVerified ?? false
  const minConfidence = options.minConfidence ?? 0.85
  const rematch = options.rematch ?? true
  const allowGoogle = options.allowGoogle ?? false
  const model = options.model || 'google/gemini-2.5-flash-lite'
  const concurrency = options.concurrency ?? 5
  const omdbApiKey = process.env.OMDB_API_KEY
  const serializeDbWrite = createDbWriteSerializer()

  const db = getAdminDatabase()
  ensureMatchReviewQueueTable(db)
  ensureAuditAttemptsTable(db)
  const verifiedFilter = includeVerified ? '' : 'AND m.verified = 0'

  const recordAuditStmt = db.prepare(
    `INSERT INTO audit_attempts (movieId, auditedAt, outcome, detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(movieId) DO UPDATE SET
       auditedAt = excluded.auditedAt,
       outcome = excluded.outcome,
       detail = excluded.detail`
  )
  const deleteAuditStmt = db.prepare('DELETE FROM audit_attempts WHERE movieId = ?')
  const recordAudit = (
    movieId: string,
    outcome: 'clean' | 'kept' | 'rematched' | 'uncertain',
    detail?: string
  ) => {
    if (dryRun) return
    recordAuditStmt.run(movieId, new Date().toISOString(), outcome, detail ?? null)
  }
  const deleteAudit = (movieId: string) => {
    if (dryRun) return
    deleteAuditStmt.run(movieId)
  }

  // Step 1: Pending false_hit queue items (up to safeLimit)
  const queueRows = db
    .prepare(
      `SELECT id, movieId, sourceId, currentImdbId, llmVerdict, llmConfidence, llmReason
       FROM match_review_queue
       WHERE status = 'pending' AND kind = 'false_hit'
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(safeLimit) as Array<{
    id: number
    movieId: string
    sourceId: string | null
    currentImdbId: string | null
    llmVerdict: 'match' | 'mismatch' | 'uncertain' | null
    llmConfidence: number | null
    llmReason: string | null
  }>

  const queueMovieIds = new Set(queueRows.map(r => r.movieId))
  const remaining = Math.max(0, safeLimit - queueRows.length)

  // Step 2: Unverified matched movies not already in Step 1
  const rawMovies =
    remaining > 0
      ? (db
          .prepare(
            `SELECT
              m.movieId, m.title as movieTitle, m.year as movieYear,
              md.Title as omdbTitle, md.Year as omdbYear, md.Runtime as omdbRuntime,
              md.Director as omdbDirector, md.Actors as omdbActors, md.Plot as omdbPlot, md.Type as omdbType
            FROM movies m
            LEFT JOIN metadata md ON m.movieId = md.movieId
            LEFT JOIN audit_attempts aa ON m.movieId = aa.movieId
            WHERE m.movieId LIKE 'tt%'
              ${verifiedFilter}
            ORDER BY aa.auditedAt IS NOT NULL ASC, aa.auditedAt ASC, m.lastUpdated DESC
            LIMIT ?`
          )
          .all(remaining + queueMovieIds.size) as Array<{
          movieId: string
          movieTitle: string
          movieYear: number | null
          omdbTitle: string | null
          omdbYear: string | null
          omdbRuntime: string | null
          omdbDirector: string | null
          omdbActors: string | null
          omdbPlot: string | null
          omdbType: string | null
        }>)
      : []

  const movies = rawMovies.filter(m => !queueMovieIds.has(m.movieId)).slice(0, remaining)

  const getMovieStmt = db.prepare(
    `SELECT
      m.movieId, m.title as movieTitle, m.year as movieYear,
      md.Title as omdbTitle, md.Year as omdbYear, md.Runtime as omdbRuntime,
      md.Director as omdbDirector, md.Actors as omdbActors, md.Plot as omdbPlot, md.Type as omdbType
     FROM movies m
     LEFT JOIN metadata md ON m.movieId = md.movieId
     WHERE m.movieId = ?`
  )

  const getSourcesStmt = db.prepare(
    `SELECT s.id, s.movieId, s.sourceId, s.channelId, c.platform, c.name as channelName,
            s.title, s.description, s.size, s.duration, s.year
     FROM sources s
     JOIN channels c ON s.channelId = c.id
     WHERE s.movieId = ?`
  )

  const total = queueRows.length + movies.length
  let scanned = 0
  let deterministicFlagged = 0
  let llmKept = 0
  let autoRematched = 0
  let autoUnmatched = 0
  let queuedUncertain = 0
  let errors = 0
  const samples: AutoAuditFalseHitsResult['samples'] = []

  emitProgress({
    type: 'audit',
    status: 'starting',
    current: 0,
    total,
    message: `Starting ${dryRun ? 'dry-run ' : ''}false-hit fix (${queueRows.length} queued, ${movies.length} matched movies)...`,
    successCurrent: 0,
    failedCurrent: 0,
  })

  const startedAt = Date.now()

  try {
    // Step 1: Resolve pending false_hit queue items first
    await runWithConcurrency(queueRows, concurrency, async row => {
      try {
        const movie = getMovieStmt.get(row.movieId) as
          | {
              movieId: string
              movieTitle: string
              movieYear: number | null
              omdbTitle: string | null
              omdbYear: string | null
              omdbRuntime: string | null
              omdbDirector: string | null
              omdbActors: string | null
              omdbPlot: string | null
              omdbType: string | null
            }
          | undefined

        const sources = movie ? (getSourcesStmt.all(movie.movieId) as SourceRow[]) : []
        const primarySource = sources[0]

        if (!movie || !movie.movieId.startsWith('tt') || !primarySource) {
          if (!dryRun) {
            await serializeDbWrite(() => resolveReviewItem(db, row.id, 'resolved'))
          }
          return
        }

        const candidateTitle = movie.omdbTitle || movie.movieTitle
        const candidateYear = extractYearFromTitle(movie.omdbYear) ?? movie.movieYear ?? null
        const candidateRuntimeMin = parseRuntimeMinutes(movie.omdbRuntime)
        const rawSourceTitle = primarySource.title || movie.movieTitle
        const sourceDurationMin =
          primarySource.duration && primarySource.duration > 0
            ? Math.round(primarySource.duration / 60)
            : null

        const hasCachedVerdict =
          row.llmVerdict !== null &&
          row.llmConfidence !== null &&
          row.llmConfidence !== undefined &&
          !row.llmReason?.startsWith('Verification error:')

        const verdict = hasCachedVerdict
          ? {
              verdict: row.llmVerdict!,
              confidence: row.llmConfidence!,
              reason: row.llmReason || 'Cached queue verdict',
            }
          : await verifyMatchCandidate(
              {
                movieId: movie.movieId,
                title: rawSourceTitle,
                year: primarySource.year ?? extractYearFromTitle(rawSourceTitle),
                durationMin: sourceDurationMin,
                description: primarySource.description,
                channelName: primarySource.channelName,
              },
              {
                imdbId: movie.movieId,
                title: candidateTitle,
                year: candidateYear,
                runtimeMin: candidateRuntimeMin,
                director: movie.omdbDirector,
                actors: movie.omdbActors,
                plot: movie.omdbPlot,
                type: movie.omdbType,
              },
              { model }
            )

        if (verdict.verdict === 'match' && verdict.confidence >= minConfidence) {
          llmKept++
          if (!dryRun) {
            await serializeDbWrite(() => {
              resolveReviewItem(db, row.id, 'resolved')
              recordAudit(movie.movieId, 'kept', verdict.reason)
            })
          }
          if (samples.length < 30) {
            samples.push({
              movieId: movie.movieId,
              title: candidateTitle,
              action: 'kept',
              llmVerdict: verdict.verdict,
              llmConfidence: verdict.confidence,
              llmReason: verdict.reason,
              flags: ['queued_false_hit'],
            })
          }
          return
        }

        if (verdict.verdict === 'mismatch' && verdict.confidence >= minConfidence) {
          let replacementId: string | null = null
          let replacementMeta: MovieMetadata | null = null

          if (rematch) {
            const replacement = await findReplacementImdbMatch(
              {
                movieId: movie.movieId,
                rawTitle: rawSourceTitle,
                description: primarySource.description,
                sourceId: primarySource.sourceId,
                platform: primarySource.platform,
                channelId: primarySource.channelId,
                channelName: primarySource.channelName,
                sourceYear: primarySource.year,
                movieYear: movie.movieYear,
                sourceDurationMin,
                excludeImdbId: movie.movieId,
              },
              {
                minRematchConfidence: Math.max(minConfidence, 0.85),
                allowGoogle,
                model,
                omdbApiKey,
              }
            )
            if (replacement) {
              replacementId = replacement.imdbId
              replacementMeta = replacement.meta
            }
          }

          if (replacementId && isImdbId(replacementId)) {
            const finalReplacementId = replacementId
            const finalReplacementMeta = replacementMeta
            autoRematched++
            if (!dryRun) {
              await serializeDbWrite(async () => {
                const mig = await migrateMovieId(movie.movieId, finalReplacementId)
                if (mig.success && finalReplacementMeta) {
                  upsertMetadataAndMovie(db, finalReplacementId, finalReplacementMeta)
                }
                resolveReviewItem(db, row.id, 'resolved')
                deleteAudit(movie.movieId)
                recordAudit(finalReplacementId, 'rematched', `Rematched from ${movie.movieId}`)
              })
            }
            if (samples.length < 30) {
              samples.push({
                movieId: movie.movieId,
                title: candidateTitle,
                action: 'rematched',
                newMovieId: finalReplacementId,
                llmVerdict: verdict.verdict,
                llmConfidence: verdict.confidence,
                llmReason: verdict.reason,
                flags: ['queued_false_hit'],
              })
            }
          } else {
            autoUnmatched++
            const tempId =
              primarySource.platform === 'youtube'
                ? generateYouTubeId(primarySource.sourceId)
                : generateArchiveId(primarySource.sourceId)
            if (!dryRun) {
              await serializeDbWrite(async () => {
                db.prepare('DELETE FROM metadata WHERE movieId = ?').run(movie.movieId)
                await migrateMovieId(movie.movieId, tempId)
                db.prepare(
                  'UPDATE movies SET title = ?, verified = 0, lastUpdated = ? WHERE movieId = ?'
                ).run(rawSourceTitle, new Date().toISOString(), tempId)
                resolveReviewItem(db, row.id, 'resolved')
                deleteAudit(movie.movieId)
              })
            }
            if (samples.length < 30) {
              samples.push({
                movieId: movie.movieId,
                title: candidateTitle,
                action: 'unmatched',
                newMovieId: tempId,
                llmVerdict: verdict.verdict,
                llmConfidence: verdict.confidence,
                llmReason: verdict.reason,
                flags: ['queued_false_hit'],
              })
            }
          }
          return
        }

        queuedUncertain++
        if (samples.length < 30) {
          samples.push({
            movieId: movie.movieId,
            title: candidateTitle,
            action: 'queued',
            llmVerdict: verdict.verdict,
            llmConfidence: verdict.confidence,
            llmReason: verdict.reason,
            flags: ['queued_false_hit'],
          })
        }
      } catch (err) {
        errors++
        console.error(
          `[AutoAuditFalseHits] Error resolving queue #${row.id} (${row.movieId}):`,
          err
        )
      } finally {
        scanned++
        emitProgress({
          type: 'audit',
          status: 'in_progress',
          current: scanned,
          total,
          message: `Resolving queued false hit #${row.id} (${row.movieId})`,
          successCurrent: autoRematched + autoUnmatched + llmKept,
          failedCurrent: queuedUncertain + errors,
          estimatedTimeRemaining: computeEtaSeconds(startedAt, scanned, total),
        })
      }
    })

    // Step 2: Scan unverified matched movies
    await runWithConcurrency(movies, concurrency, async movie => {
      const sources = getSourcesStmt.all(movie.movieId) as SourceRow[]
      const primarySource = sources[0]
      if (!primarySource) {
        scanned++
        return
      }

      const candidateTitle = movie.omdbTitle || movie.movieTitle
      const candidateYear = extractYearFromTitle(movie.omdbYear) ?? movie.movieYear ?? null
      const candidateRuntimeMin = parseRuntimeMinutes(movie.omdbRuntime)
      const rawSourceTitle = primarySource.title || movie.movieTitle
      const sourceDurationMin =
        primarySource.duration && primarySource.duration > 0
          ? Math.round(primarySource.duration / 60)
          : null

      try {
        const scoreResult = scoreMatchCandidate(
          {
            title: rawSourceTitle,
            sourceYear: primarySource.year ?? null,
            titleYear: extractYearFromTitle(rawSourceTitle),
            sourceDurationMin,
          },
          {
            imdbId: movie.movieId,
            title: candidateTitle,
            year: candidateYear,
            runtimeMin: candidateRuntimeMin,
            director: movie.omdbDirector,
            cast: movie.omdbActors,
            type: movie.omdbType,
          }
        )

        const isSuspicious =
          scoreResult.tier === 'reject' ||
          scoreResult.flags.some(f =>
            [
              'runtime_feature_short_mismatch',
              'runtime_major_mismatch',
              'year_major_mismatch',
              'non_movie_candidate',
              'title_low_similarity',
            ].includes(f)
          )

        if (!isSuspicious) {
          if (!dryRun) {
            await serializeDbWrite(() =>
              recordAudit(movie.movieId, 'clean', `Score ${scoreResult.score}`)
            )
          }
          return
        }

        deterministicFlagged++

        const verdict = await verifyMatchCandidate(
          {
            movieId: movie.movieId,
            title: rawSourceTitle,
            year: primarySource.year ?? extractYearFromTitle(rawSourceTitle),
            durationMin: sourceDurationMin,
            description: primarySource.description,
            channelName: primarySource.channelName,
          },
          {
            imdbId: movie.movieId,
            title: candidateTitle,
            year: candidateYear,
            runtimeMin: candidateRuntimeMin,
            director: movie.omdbDirector,
            actors: movie.omdbActors,
            plot: movie.omdbPlot,
            type: movie.omdbType,
          },
          { model }
        )

        // High-confidence KEEP
        if (verdict.verdict === 'match' && verdict.confidence >= minConfidence) {
          llmKept++
          if (!dryRun) {
            await serializeDbWrite(() => recordAudit(movie.movieId, 'kept', verdict.reason))
          }
          if (samples.length < 30) {
            samples.push({
              movieId: movie.movieId,
              title: candidateTitle,
              action: 'kept',
              llmVerdict: verdict.verdict,
              llmConfidence: verdict.confidence,
              llmReason: verdict.reason,
              flags: scoreResult.flags,
            })
          }
          return
        }

        // High-confidence MISMATCH -> try auto-rematch, else auto-unmatch
        if (verdict.verdict === 'mismatch' && verdict.confidence >= minConfidence) {
          let replacementId: string | null = null
          let replacementMeta: MovieMetadata | null = null

          if (rematch) {
            const replacement = await findReplacementImdbMatch(
              {
                movieId: movie.movieId,
                rawTitle: rawSourceTitle,
                description: primarySource.description,
                sourceId: primarySource.sourceId,
                platform: primarySource.platform,
                channelId: primarySource.channelId,
                channelName: primarySource.channelName,
                sourceYear: primarySource.year,
                movieYear: movie.movieYear,
                sourceDurationMin,
                excludeImdbId: movie.movieId,
              },
              {
                minRematchConfidence: Math.max(minConfidence, 0.85),
                allowGoogle,
                model,
                omdbApiKey,
              }
            )
            if (replacement) {
              replacementId = replacement.imdbId
              replacementMeta = replacement.meta
            }
          }

          if (replacementId && isImdbId(replacementId)) {
            const finalReplacementId = replacementId
            const finalReplacementMeta = replacementMeta
            autoRematched++
            if (!dryRun) {
              await serializeDbWrite(async () => {
                const mig = await migrateMovieId(movie.movieId, finalReplacementId)
                if (mig.success && finalReplacementMeta) {
                  upsertMetadataAndMovie(db, finalReplacementId, finalReplacementMeta)
                }
                db.prepare(
                  `UPDATE match_review_queue
                   SET status = 'resolved', resolvedAt = datetime('now')
                   WHERE movieId = ? AND kind = 'false_hit' AND status = 'pending'`
                ).run(movie.movieId)
                deleteAudit(movie.movieId)
                recordAudit(finalReplacementId, 'rematched', `Rematched from ${movie.movieId}`)
              })
            }
            if (samples.length < 30) {
              samples.push({
                movieId: movie.movieId,
                title: candidateTitle,
                action: 'rematched',
                newMovieId: finalReplacementId,
                llmVerdict: verdict.verdict,
                llmConfidence: verdict.confidence,
                llmReason: verdict.reason,
                flags: scoreResult.flags,
              })
            }
          } else {
            autoUnmatched++
            const tempId =
              primarySource.platform === 'youtube'
                ? generateYouTubeId(primarySource.sourceId)
                : generateArchiveId(primarySource.sourceId)
            if (!dryRun) {
              await serializeDbWrite(async () => {
                db.prepare('DELETE FROM metadata WHERE movieId = ?').run(movie.movieId)
                await migrateMovieId(movie.movieId, tempId)
                db.prepare(
                  'UPDATE movies SET title = ?, verified = 0, lastUpdated = ? WHERE movieId = ?'
                ).run(rawSourceTitle, new Date().toISOString(), tempId)
                db.prepare(
                  `UPDATE match_review_queue
                   SET status = 'resolved', resolvedAt = datetime('now')
                   WHERE movieId = ? AND kind = 'false_hit' AND status = 'pending'`
                ).run(movie.movieId)
                deleteAudit(movie.movieId)
              })
            }
            if (samples.length < 30) {
              samples.push({
                movieId: movie.movieId,
                title: candidateTitle,
                action: 'unmatched',
                newMovieId: tempId,
                llmVerdict: verdict.verdict,
                llmConfidence: verdict.confidence,
                llmReason: verdict.reason,
                flags: scoreResult.flags,
              })
            }
          }
          return
        }

        // Uncertain -> enqueue ONLY these for human review
        queuedUncertain++
        if (!dryRun) {
          await serializeDbWrite(() => {
            if (!verdict.reason.startsWith('Verification error:')) {
              recordAudit(movie.movieId, 'uncertain', verdict.reason)
            }
            enqueueReviewItem(db, {
              movieId: movie.movieId,
              kind: 'false_hit',
              sourceId: primarySource.sourceId,
              currentImdbId: movie.movieId,
              proposedImdbId: null,
              score: scoreResult.score,
              llmVerdict: verdict.verdict,
              llmConfidence: verdict.confidence,
              llmReason: verdict.reason,
              flags: scoreResult.flags,
            })
          })
        }
        if (samples.length < 30) {
          samples.push({
            movieId: movie.movieId,
            title: candidateTitle,
            action: 'queued',
            llmVerdict: verdict.verdict,
            llmConfidence: verdict.confidence,
            llmReason: verdict.reason,
            flags: scoreResult.flags,
          })
        }
      } catch (err) {
        errors++
        console.error(`[AutoAuditFalseHits] Error auditing ${movie.movieId}:`, err)
      } finally {
        scanned++
        if (scanned % 25 === 0 || scanned === total || deterministicFlagged > 0) {
          emitProgress({
            type: 'audit',
            status: 'in_progress',
            current: scanned,
            total,
            message: `Auditing: ${candidateTitle} (flagged: ${deterministicFlagged}, fixed: ${autoRematched + autoUnmatched})`,
            successCurrent: autoRematched + autoUnmatched + llmKept,
            failedCurrent: queuedUncertain + errors,
            estimatedTimeRemaining: computeEtaSeconds(startedAt, scanned, total),
          })
        }
      }
    })

    emitProgress({
      type: 'audit',
      status: 'completed',
      current: scanned,
      total,
      message: `Auto false-hit audit ${dryRun ? '(dry run) ' : ''}complete: ${autoRematched} rematched, ${autoUnmatched} unmatched, ${queuedUncertain} uncertain queued`,
      successCurrent: autoRematched + autoUnmatched + llmKept,
      failedCurrent: queuedUncertain,
    })

    return {
      task: 'audit_false_hits',
      dryRun,
      scanned,
      deterministicFlagged,
      llmKept,
      autoRematched,
      autoUnmatched,
      queuedUncertain,
      errors,
      samples,
    }
  } catch (error) {
    emitProgress({
      type: 'audit',
      status: 'error',
      current: scanned,
      total,
      message: error instanceof Error ? error.message : 'Auto false-hit audit failed',
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * 2b. Automated Pending False-Hit Queue Resolver
 * Resolves pending `false_hit` items in `match_review_queue`:
 * - Reuses existing non-error LLM verdicts (or calls verifyMatchCandidate if missing/errored)
 * - Auto-keeps high-confidence matches
 * - Auto-rematches (Phase 1 + Phase 2) or auto-unmatches high-confidence mismatches
 * - Leaves only truly uncertain items in `pending`
 */
export async function runAutoResolveFalseHitQueue(
  options: AutoResolveFalseHitQueueOptions = {}
): Promise<AutoResolveFalseHitQueueResult> {
  const dryRun = options.dryRun ?? true
  const safeLimit = Math.max(1, Math.min(20000, Number(options.limit) || 500))
  const minConfidence = options.minConfidence ?? 0.85
  const rematch = options.rematch ?? true
  const allowGoogle = options.allowGoogle ?? false
  const model = options.model || 'google/gemini-2.5-flash-lite'
  const omdbApiKey = process.env.OMDB_API_KEY

  const db = getAdminDatabase()
  ensureMatchReviewQueueTable(db)

  const queueRows = db
    .prepare(
      `SELECT id, movieId, sourceId, currentImdbId, llmVerdict, llmConfidence, llmReason
       FROM match_review_queue
       WHERE status = 'pending' AND kind = 'false_hit'
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(safeLimit) as Array<{
    id: number
    movieId: string
    sourceId: string | null
    currentImdbId: string | null
    llmVerdict: 'match' | 'mismatch' | 'uncertain' | null
    llmConfidence: number | null
    llmReason: string | null
  }>

  const getMovieStmt = db.prepare(
    `SELECT
      m.movieId, m.title as movieTitle, m.year as movieYear,
      md.Title as omdbTitle, md.Year as omdbYear, md.Runtime as omdbRuntime,
      md.Director as omdbDirector, md.Actors as omdbActors, md.Plot as omdbPlot, md.Type as omdbType
     FROM movies m
     LEFT JOIN metadata md ON m.movieId = md.movieId
     WHERE m.movieId = ?`
  )

  const getSourcesStmt = db.prepare(
    `SELECT s.id, s.movieId, s.sourceId, s.channelId, c.platform, c.name as channelName,
            s.title, s.description, s.size, s.duration, s.year
     FROM sources s
     JOIN channels c ON s.channelId = c.id
     WHERE s.movieId = ?`
  )

  const total = queueRows.length
  let scanned = 0
  let autoKept = 0
  let autoRematched = 0
  let autoUnmatched = 0
  let stillUncertain = 0
  let alreadyResolved = 0
  let errors = 0
  const samples: AutoResolveFalseHitQueueResult['samples'] = []

  emitProgress({
    type: 'audit',
    status: 'starting',
    current: 0,
    total,
    message: `Starting ${dryRun ? 'dry-run ' : ''}false-hit queue resolution (${total} pending items)...`,
    successCurrent: 0,
    failedCurrent: 0,
  })

  const startedAt = Date.now()

  try {
    for (const row of queueRows) {
      scanned++
      emitProgress({
        type: 'audit',
        status: 'in_progress',
        current: scanned,
        total,
        message: `Resolving false-hit queue #${row.id} (${row.movieId})`,
        successCurrent: autoKept + autoRematched + autoUnmatched,
        failedCurrent: stillUncertain + errors,
        estimatedTimeRemaining: computeEtaSeconds(startedAt, scanned - 1, total),
      })

      try {
        const movie = getMovieStmt.get(row.movieId) as
          | {
              movieId: string
              movieTitle: string
              movieYear: number | null
              omdbTitle: string | null
              omdbYear: string | null
              omdbRuntime: string | null
              omdbDirector: string | null
              omdbActors: string | null
              omdbPlot: string | null
              omdbType: string | null
            }
          | undefined

        const sources = movie ? (getSourcesStmt.all(movie.movieId) as SourceRow[]) : []
        const primarySource = sources[0]

        if (!movie || !movie.movieId.startsWith('tt') || !primarySource) {
          alreadyResolved++
          if (!dryRun) {
            resolveReviewItem(db, row.id, 'resolved')
          }
          if (samples.length < 30) {
            samples.push({
              queueId: row.id,
              movieId: row.movieId,
              title: movie?.movieTitle || row.movieId,
              action: 'already_resolved',
              llmVerdict: row.llmVerdict || 'uncertain',
              llmConfidence: row.llmConfidence ?? 0,
              llmReason: 'Movie already migrated/unmatched or missing source',
            })
          }
          continue
        }

        const candidateTitle = movie.omdbTitle || movie.movieTitle
        const candidateYear = extractYearFromTitle(movie.omdbYear) ?? movie.movieYear ?? null
        const candidateRuntimeMin = parseRuntimeMinutes(movie.omdbRuntime)
        const rawSourceTitle = primarySource.title || movie.movieTitle
        const sourceDurationMin =
          primarySource.duration && primarySource.duration > 0
            ? Math.round(primarySource.duration / 60)
            : null

        const hasCachedVerdict =
          row.llmVerdict !== null &&
          row.llmConfidence !== null &&
          row.llmConfidence !== undefined &&
          !row.llmReason?.startsWith('Verification error:')

        const verdict = hasCachedVerdict
          ? {
              verdict: row.llmVerdict!,
              confidence: row.llmConfidence!,
              reason: row.llmReason || 'Cached queue verdict',
            }
          : await verifyMatchCandidate(
              {
                movieId: movie.movieId,
                title: rawSourceTitle,
                year: primarySource.year ?? extractYearFromTitle(rawSourceTitle),
                durationMin: sourceDurationMin,
                description: primarySource.description,
                channelName: primarySource.channelName,
              },
              {
                imdbId: movie.movieId,
                title: candidateTitle,
                year: candidateYear,
                runtimeMin: candidateRuntimeMin,
                director: movie.omdbDirector,
                actors: movie.omdbActors,
                plot: movie.omdbPlot,
                type: movie.omdbType,
              },
              { model }
            )

        if (verdict.verdict === 'match' && verdict.confidence >= minConfidence) {
          autoKept++
          if (!dryRun) {
            resolveReviewItem(db, row.id, 'resolved')
          }
          if (samples.length < 30) {
            samples.push({
              queueId: row.id,
              movieId: movie.movieId,
              title: candidateTitle,
              action: 'kept',
              llmVerdict: verdict.verdict,
              llmConfidence: verdict.confidence,
              llmReason: verdict.reason,
            })
          }
          continue
        }

        if (verdict.verdict === 'mismatch' && verdict.confidence >= minConfidence) {
          let replacementId: string | null = null
          let replacementMeta: MovieMetadata | null = null

          if (rematch) {
            const replacement = await findReplacementImdbMatch(
              {
                movieId: movie.movieId,
                rawTitle: rawSourceTitle,
                description: primarySource.description,
                sourceId: primarySource.sourceId,
                platform: primarySource.platform,
                channelId: primarySource.channelId,
                channelName: primarySource.channelName,
                sourceYear: primarySource.year,
                movieYear: movie.movieYear,
                sourceDurationMin,
                excludeImdbId: movie.movieId,
              },
              {
                minRematchConfidence: Math.max(minConfidence, 0.85),
                allowGoogle,
                model,
                omdbApiKey,
              }
            )
            if (replacement) {
              replacementId = replacement.imdbId
              replacementMeta = replacement.meta
            }
          }

          if (replacementId && isImdbId(replacementId)) {
            autoRematched++
            if (!dryRun) {
              const mig = await migrateMovieId(movie.movieId, replacementId)
              if (mig.success && replacementMeta) {
                upsertMetadataAndMovie(db, replacementId, replacementMeta)
              }
              resolveReviewItem(db, row.id, 'resolved')
            }
            if (samples.length < 30) {
              samples.push({
                queueId: row.id,
                movieId: movie.movieId,
                title: candidateTitle,
                action: 'rematched',
                newMovieId: replacementId,
                llmVerdict: verdict.verdict,
                llmConfidence: verdict.confidence,
                llmReason: verdict.reason,
              })
            }
          } else {
            autoUnmatched++
            const tempId =
              primarySource.platform === 'youtube'
                ? generateYouTubeId(primarySource.sourceId)
                : generateArchiveId(primarySource.sourceId)
            if (!dryRun) {
              db.prepare('DELETE FROM metadata WHERE movieId = ?').run(movie.movieId)
              await migrateMovieId(movie.movieId, tempId)
              db.prepare(
                'UPDATE movies SET title = ?, verified = 0, lastUpdated = ? WHERE movieId = ?'
              ).run(rawSourceTitle, new Date().toISOString(), tempId)
              resolveReviewItem(db, row.id, 'resolved')
            }
            if (samples.length < 30) {
              samples.push({
                queueId: row.id,
                movieId: movie.movieId,
                title: candidateTitle,
                action: 'unmatched',
                newMovieId: tempId,
                llmVerdict: verdict.verdict,
                llmConfidence: verdict.confidence,
                llmReason: verdict.reason,
              })
            }
          }
          continue
        }

        stillUncertain++
        if (samples.length < 30) {
          samples.push({
            queueId: row.id,
            movieId: movie.movieId,
            title: candidateTitle,
            action: 'uncertain',
            llmVerdict: verdict.verdict,
            llmConfidence: verdict.confidence,
            llmReason: verdict.reason,
          })
        }
      } catch (err) {
        errors++
        console.error(`[AutoResolveQueue] Error resolving queue #${row.id} (${row.movieId}):`, err)
      }
    }

    emitProgress({
      type: 'audit',
      status: 'completed',
      current: scanned,
      total,
      message: `False-hit queue ${dryRun ? '(dry run) ' : ''}complete: ${autoKept} kept, ${autoRematched} rematched, ${autoUnmatched} unmatched, ${stillUncertain} uncertain`,
      successCurrent: autoKept + autoRematched + autoUnmatched,
      failedCurrent: stillUncertain + errors,
    })

    return {
      task: 'resolve_false_hit_queue',
      dryRun,
      scanned,
      autoKept,
      autoRematched,
      autoUnmatched,
      stillUncertain,
      alreadyResolved,
      errors,
      samples,
    }
  } catch (error) {
    emitProgress({
      type: 'audit',
      status: 'error',
      current: scanned,
      total,
      message: error instanceof Error ? error.message : 'False-hit queue resolution failed',
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * 3. Automated Unmatched Movie Matcher
 * Tiered funnel: direct description tt* -> local IMDb index -> TMDB -> IMDb Suggestion -> Wikidata -> OMDb -> optional Google CSE
 * Auto-applies deterministic high-confidence and LLM >= minConfidence matches; queues ONLY uncertain tail.
 */
export async function runAutoMatchUnmatched(
  options: AutoMatchUnmatchedOptions = {}
): Promise<AutoMatchUnmatchedResult> {
  const dryRun = options.dryRun ?? true
  const safeLimit = Math.max(1, Math.min(10000, Number(options.limit) || 200))
  const minConfidence = options.minConfidence ?? 0.85
  const allowGoogle = options.allowGoogle ?? false
  const model = options.model || 'google/gemini-2.5-flash-lite'
  const concurrency = options.concurrency ?? 5
  const omdbApiKey = process.env.OMDB_API_KEY
  const serializeDbWrite = createDbWriteSerializer()

  const db = getAdminDatabase()
  ensureMatchAttemptsTable(db)

  const params: unknown[] = []
  let channelClause = ''
  if (options.channel && options.channel.trim()) {
    channelClause = 'AND (c.id = ? OR lower(c.name) = lower(?))'
    params.push(options.channel.trim(), options.channel.trim())
  }
  let attemptClause = ''
  if (options.skipAttempted) {
    attemptClause = 'AND ma.movieId IS NULL'
  } else if (options.retryAfterDays && options.retryAfterDays > 0) {
    attemptClause = "AND (ma.attemptedAt IS NULL OR ma.attemptedAt < datetime('now', ?))"
    params.push(`-${Math.floor(options.retryAfterDays)} days`)
  }
  params.push(safeLimit)

  const movies = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, m.year as movieYear,
        s.sourceId, s.title as sourceTitle, s.description as sourceDescription,
        s.duration as sourceDuration, s.year as sourceYear,
        c.id as channelId, c.name as channelName, c.platform
      FROM movies m
      JOIN sources s ON m.movieId = s.movieId
      JOIN channels c ON s.channelId = c.id
      LEFT JOIN match_attempts ma ON m.movieId = ma.movieId
      WHERE m.movieId NOT LIKE 'tt%'
        ${channelClause}
        ${attemptClause}
      GROUP BY m.movieId
      ORDER BY ma.attemptedAt IS NOT NULL ASC, ma.attemptedAt ASC, m.lastUpdated DESC
      LIMIT ?`
    )
    .all(...params) as Array<{
    movieId: string
    movieTitle: string
    movieYear: number | null
    sourceId: string
    sourceTitle: string | null
    sourceDescription: string | null
    sourceDuration: number | null
    sourceYear: number | null
    channelId: string
    channelName: string
    platform: string
  }>

  const recordAttemptStmt = db.prepare(
    `INSERT INTO match_attempts (movieId, attemptedAt, outcome, candidateCount, reason)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(movieId) DO UPDATE SET
       attemptedAt = excluded.attemptedAt,
       outcome = excluded.outcome,
       candidateCount = excluded.candidateCount,
       reason = excluded.reason`
  )
  const recordAttempt = (
    movieId: string,
    outcome: 'matched' | 'queued' | 'no_match' | 'error',
    candidateCount: number,
    reason?: string
  ) => {
    if (dryRun) return
    recordAttemptStmt.run(
      movieId,
      new Date().toISOString(),
      outcome,
      candidateCount,
      reason ?? null
    )
  }

  const total = movies.length
  let scanned = 0
  let directUrlMatches = 0
  let deterministicMatches = 0
  let llmMatches = 0
  let plannedLlmMatches = 0
  let notAMovie = 0
  let queuedUncertain = 0
  let noMatch = 0
  let errors = 0
  const samples: AutoMatchUnmatchedResult['samples'] = []

  emitProgress({
    type: 'audit',
    status: 'starting',
    current: 0,
    total,
    message: `Starting ${dryRun ? 'dry-run ' : ''}auto-match for ${total} unmatched movies...`,
    successCurrent: 0,
    failedCurrent: 0,
  })

  const startedAt = Date.now()

  try {
    await runWithConcurrency(movies, concurrency, async movie => {
      const rawTitle = movie.sourceTitle || movie.movieTitle
      const extracted = extractSourceMetadata({
        rawTitle,
        description: movie.sourceDescription,
        sourceId: movie.sourceId,
        platform: movie.platform,
        channelId: movie.channelId,
        channelName: movie.channelName,
      })
      const queryTitle = extracted.cleanTitle || rawTitle
      const queryYear =
        extracted.year ??
        movie.sourceYear ??
        (movie.platform === 'archive.org' && movie.movieYear && movie.movieYear < 2020
          ? movie.movieYear
          : undefined)
      const sourceDurationMin =
        movie.sourceDuration && movie.sourceDuration > 0
          ? Math.round(movie.sourceDuration / 60)
          : null

      const omdbCache = new Map<string, MovieMetadata | null>()

      try {
        // Pass 1: Direct tt* in description
        const directId = extractImdbIdFromText(movie.sourceDescription || undefined)
        if (directId) {
          const meta = await fetchOmdbCached(directId, omdbApiKey, omdbCache)
          await serializeDbWrite(async () => {
            if (!dryRun) {
              const mig = await migrateMovieId(movie.movieId, directId)
              if (mig.success && meta) {
                upsertMetadataAndMovie(db, directId, meta)
              }
            }
            recordAttempt(movie.movieId, 'matched', 1, `Direct IMDb ID ${directId}`)
          })
          directUrlMatches++
          if (samples.length < 30) {
            samples.push({
              oldMovieId: movie.movieId,
              title: rawTitle,
              action: 'direct_match',
              imdbId: directId,
              matchedTitle: meta?.Title || directId,
              confidence: 1,
              reason: 'Direct IMDb ID in source description',
            })
          }
          return
        }

        const queryInput = {
          title: queryTitle,
          originalTitle: extracted.originalTitle,
          altTitles: extracted.altTitles,
          year: queryYear,
          description: movie.sourceDescription || undefined,
          director: extracted.director,
          cast: extracted.cast,
        }

        const scoreCandidate = (cand: RetrievedCandidate) =>
          scoreMatchCandidate(
            {
              title: queryTitle,
              originalTitle: extracted.originalTitle ?? null,
              altTitles: extracted.altTitles,
              sourceYear: queryYear ?? null,
              titleYear: extracted.year ?? null,
              sourceDurationMin,
              director: extracted.director ?? null,
              cast: extracted.cast,
            },
            {
              imdbId: cand.imdbId,
              title: cand.title,
              originalTitle: cand.originalTitle,
              altTitles: cand.altTitles,
              year: cand.year ?? null,
              runtimeMin: cand.runtimeMinutes ?? null,
              director: cand.directors.join(', ') || null,
              cast: cand.cast,
              type: cand.titleType ?? null,
            }
          )

        // Pass 1b: Local-first fast path (<2ms via local imdb-index.db)
        const localCandidates = await retrieveCandidates(queryInput, {
          limit: 15,
          omdbApiKey,
          skipExternalApis: true,
        })
        if (localCandidates.length > 0) {
          const localScored = localCandidates
            .map(cand => ({ cand, result: scoreCandidate(cand) }))
            .sort((a, b) => b.result.score - a.result.score)
          const localTop = localScored[0]!
          const localSecond = localScored[1]
          const localHasYearOrPeople =
            localTop.result.breakdown.yearScore > 0 || localTop.result.breakdown.peopleScore > 0

          if (
            localTop.result.tier === 'auto_accept' &&
            localTop.result.score >= 85 &&
            localHasYearOrPeople &&
            (!localSecond || localTop.result.score - localSecond.result.score >= 10)
          ) {
            const meta = await fetchOmdbCached(localTop.cand.imdbId, omdbApiKey, omdbCache)
            await serializeDbWrite(async () => {
              if (!dryRun) {
                const mig = await migrateMovieId(movie.movieId, localTop.cand.imdbId)
                if (mig.success && meta) {
                  upsertMetadataAndMovie(db, localTop.cand.imdbId, meta)
                }
              }
              recordAttempt(
                movie.movieId,
                'matched',
                localCandidates.length,
                `Local deterministic auto-accept (${localTop.cand.imdbId}, score ${localTop.result.score})`
              )
            })
            deterministicMatches++
            if (samples.length < 30) {
              samples.push({
                oldMovieId: movie.movieId,
                title: rawTitle,
                action: 'deterministic_match',
                imdbId: localTop.cand.imdbId,
                matchedTitle: meta?.Title || localTop.cand.title,
                confidence: Number((localTop.result.score / 100).toFixed(2)),
                reason: `Local deterministic auto-accept (score ${localTop.result.score}) via ${localTop.cand.sources.join('+')}`,
              })
            }
            return
          }
        }

        // Pass 2: Tiered multi-source retrieval (parallel Tiers 3–7)
        const candidates = await retrieveCandidates(queryInput, {
          limit: 6,
          omdbApiKey,
          allowGoogleFallback: allowGoogle,
        })

        // Pass 3: Deterministic scoring & Pass-1 LLM adjudication (when candidates exist)
        let pass1Top: {
          cand: RetrievedCandidate
          result: ReturnType<typeof scoreMatchCandidate>
        } | null = null
        let pass1Adj: Awaited<ReturnType<typeof adjudicateCandidates>> | null = null
        const rejectedIds = new Set<string>()
        const rejectedSummaries: Array<{ imdbId: string; title: string; year?: number | null }> = []

        if (candidates.length > 0) {
          const scored = candidates
            .map(cand => ({ cand, result: scoreCandidate(cand) }))
            .sort((a, b) => b.result.score - a.result.score)

          const top = scored[0]!
          const second = scored[1]
          pass1Top = top

          // Auto-accept deterministic high confidence without LLM ONLY when backed by year or people evidence
          // (never bypass LLM on year-less title + runtime alone, which risks remake/generic-title false positives)
          const hasYearOrPeopleEvidence =
            top.result.breakdown.yearScore > 0 || top.result.breakdown.peopleScore > 0
          if (
            top.result.tier === 'auto_accept' &&
            hasYearOrPeopleEvidence &&
            (!second || top.result.score - second.result.score >= 10)
          ) {
            const meta = await fetchOmdbCached(top.cand.imdbId, omdbApiKey, omdbCache)
            await serializeDbWrite(async () => {
              if (!dryRun) {
                const mig = await migrateMovieId(movie.movieId, top.cand.imdbId)
                if (mig.success && meta) {
                  upsertMetadataAndMovie(db, top.cand.imdbId, meta)
                }
              }
              recordAttempt(
                movie.movieId,
                'matched',
                candidates.length,
                `Deterministic auto-accept (${top.cand.imdbId}, score ${top.result.score})`
              )
            })
            deterministicMatches++
            if (samples.length < 30) {
              samples.push({
                oldMovieId: movie.movieId,
                title: rawTitle,
                action: 'deterministic_match',
                imdbId: top.cand.imdbId,
                matchedTitle: meta?.Title || top.cand.title,
                confidence: Number((top.result.score / 100).toFixed(2)),
                reason: `Deterministic auto-accept (score ${top.result.score}) via ${top.cand.sources.join('+')}`,
              })
            }
            return
          }

          // Ambiguous -> LLM adjudicator (include non-hard-disqualified candidates if nonRejected < 3)
          const nonRejected = scored.filter(s => s.result.tier !== 'reject').slice(0, 5)
          const adjudicateList = [...nonRejected]
          if (adjudicateList.length < 3) {
            const existingIds = new Set(adjudicateList.map(s => s.cand.imdbId))
            const fallbackCandidates = scored.filter(
              s =>
                !existingIds.has(s.cand.imdbId) &&
                !s.result.flags.includes('runtime_feature_short_mismatch') &&
                !s.result.flags.includes('non_movie_candidate')
            )
            for (const fc of fallbackCandidates) {
              if (adjudicateList.length >= 5) break
              adjudicateList.push(fc)
            }
          }

          if (adjudicateList.length > 0) {
            const hydratedInputs = await hydrateCandidatesForAdjudication(
              adjudicateList.map(s => s.cand),
              omdbApiKey,
              omdbCache
            )
            const adj = await adjudicateCandidates(
              {
                movieId: movie.movieId,
                sourceId: movie.sourceId,
                title: rawTitle,
                originalTitle: extracted.originalTitle ?? null,
                altTitles: extracted.altTitles,
                year: queryYear ?? null,
                durationMin: sourceDurationMin,
                director: extracted.director ?? null,
                cast: extracted.cast,
                description: movie.sourceDescription,
                channelName: movie.channelName,
              },
              hydratedInputs,
              { model }
            )
            pass1Adj = adj

            if (adj.chosenImdbId && adj.verdict === 'match' && adj.confidence >= minConfidence) {
              const chosenId = adj.chosenImdbId
              const meta = await fetchOmdbCached(chosenId, omdbApiKey, omdbCache)
              const finalRuntimeCheck = scoreMatchCandidate(
                { title: queryTitle, sourceDurationMin },
                {
                  imdbId: chosenId,
                  title: meta?.Title || chosenId,
                  runtimeMin: parseRuntimeMinutes(meta?.Runtime),
                }
              )
              if (
                !finalRuntimeCheck.flags.includes('runtime_feature_short_mismatch') &&
                !finalRuntimeCheck.flags.includes('runtime_major_mismatch')
              ) {
                await serializeDbWrite(async () => {
                  if (!dryRun) {
                    const mig = await migrateMovieId(movie.movieId, chosenId)
                    if (mig.success && meta) {
                      upsertMetadataAndMovie(db, chosenId, meta)
                    }
                  }
                  recordAttempt(
                    movie.movieId,
                    'matched',
                    candidates.length,
                    `LLM match (${chosenId}, conf ${adj.confidence})`
                  )
                })
                llmMatches++
                if (samples.length < 30) {
                  samples.push({
                    oldMovieId: movie.movieId,
                    title: rawTitle,
                    action: 'llm_match',
                    imdbId: chosenId,
                    matchedTitle: meta?.Title || top.cand.title,
                    confidence: adj.confidence,
                    reason: adj.reason,
                  })
                }
                return
              }
            }

            // Only mark Pass-1 candidates as rejected if the LLM actually evaluated them (not on transient API errors)
            if (!adj.reason.startsWith('Adjudication error:')) {
              for (const s of adjudicateList) {
                rejectedIds.add(s.cand.imdbId)
                rejectedSummaries.push({
                  imdbId: s.cand.imdbId,
                  title: s.cand.title,
                  year: s.cand.year ?? null,
                })
              }
            }
          }
        }

        // Pass 4 (Phase 2): LLM Query Planner + Multi-Query Fan-out
        // Runs when Pass 1 returned 0 candidates or failed to reach a confident match.
        const plan = await planMatchQueries(
          {
            movieId: movie.movieId,
            sourceId: movie.sourceId,
            title: rawTitle,
            originalTitle: extracted.originalTitle ?? null,
            altTitles: extracted.altTitles,
            year: queryYear ?? null,
            durationMin: sourceDurationMin,
            director: extracted.director ?? null,
            cast: extracted.cast,
            description: movie.sourceDescription,
            channelName: movie.channelName,
          },
          rejectedSummaries,
          { model }
        )

        if (plan && !plan.isMovie) {
          notAMovie++
          noMatch++
          await serializeDbWrite(() =>
            recordAttempt(
              movie.movieId,
              'no_match',
              candidates.length,
              `not_a_movie: ${plan.reason}`
            )
          )
          return
        }

        if (plan) {
          const plannedYear = plan.year ?? queryYear
          const plannedTitle =
            plan.englishTitle || plan.cleanTitle || plan.originalTitle || queryTitle
          const plannedAlts = Array.from(
            new Set(
              [
                plan.cleanTitle,
                plan.originalTitle,
                plan.englishTitle,
                ...plan.searchQueries,
              ].filter((t): t is string => Boolean(t && t.trim()))
            )
          )
          const plannedDirector = plan.director || extracted.director
          const plannedCast = plan.cast.length > 0 ? plan.cast : extracted.cast

          const [plannedCandidates, searxSettled] = await Promise.all([
            retrieveCandidates(
              {
                title: plannedTitle,
                originalTitle: plan.originalTitle || extracted.originalTitle,
                altTitles: plannedAlts,
                year: plannedYear,
                description: movie.sourceDescription || undefined,
                director: plannedDirector,
                cast: plannedCast,
              },
              {
                limit: 8,
                omdbApiKey,
                allowGoogleFallback: allowGoogle,
              }
            ),
            isSearxngAvailable() && plan.webQueries.length > 0
              ? Promise.allSettled(
                  plan.webQueries
                    .slice(0, 2)
                    .map(wq => searchSearxngRawForImdb(wq, 4).catch(() => []))
                )
              : Promise.resolve([]),
          ])

          const freshMap = new Map<string, RetrievedCandidate>()
          for (const c of plannedCandidates) {
            if (!rejectedIds.has(c.imdbId)) {
              freshMap.set(c.imdbId, c)
            }
          }

          for (const res of searxSettled) {
            if (res.status !== 'fulfilled') continue
            for (const hit of res.value) {
              if (rejectedIds.has(hit.imdbId) || freshMap.has(hit.imdbId)) continue
              freshMap.set(hit.imdbId, {
                imdbId: hit.imdbId,
                title: hit.title,
                altTitles: [],
                year: hit.year,
                directors: [],
                cast: [],
                overview: hit.snippet,
                sources: ['searxng'],
              })
            }
          }

          const freshList = Array.from(freshMap.values())
          if (freshList.length > 0) {
            const scoredFresh = freshList
              .map(cand => ({
                cand,
                result: scoreMatchCandidate(
                  {
                    title: plannedTitle,
                    originalTitle: plan.originalTitle ?? extracted.originalTitle ?? null,
                    altTitles: plannedAlts,
                    sourceYear: plannedYear ?? null,
                    titleYear: plan.year ?? extracted.year ?? null,
                    sourceDurationMin,
                    director: plannedDirector ?? null,
                    cast: plannedCast,
                  },
                  {
                    imdbId: cand.imdbId,
                    title: cand.title,
                    originalTitle: cand.originalTitle,
                    altTitles: cand.altTitles,
                    year: cand.year ?? null,
                    runtimeMin: cand.runtimeMinutes ?? null,
                    director: cand.directors.join(', ') || null,
                    cast: cand.cast,
                    type: cand.titleType ?? null,
                  }
                ),
              }))
              .filter(
                s =>
                  !s.result.flags.includes('runtime_feature_short_mismatch') &&
                  !s.result.flags.includes('non_movie_candidate')
              )
              .sort((a, b) => b.result.score - a.result.score)
              .slice(0, 5)

            if (scoredFresh.length > 0) {
              const hydratedFresh = await hydrateCandidatesForAdjudication(
                scoredFresh.map(s => s.cand),
                omdbApiKey,
                omdbCache
              )
              const adj2 = await adjudicateCandidates(
                {
                  movieId: movie.movieId,
                  sourceId: movie.sourceId,
                  title: rawTitle,
                  originalTitle: plan.originalTitle ?? extracted.originalTitle ?? null,
                  altTitles: plannedAlts,
                  year: plannedYear ?? null,
                  durationMin: sourceDurationMin,
                  director: plannedDirector ?? null,
                  cast: plannedCast,
                  description: movie.sourceDescription,
                  channelName: movie.channelName,
                },
                hydratedFresh,
                { model }
              )

              if (
                adj2.chosenImdbId &&
                adj2.verdict === 'match' &&
                adj2.confidence >= minConfidence
              ) {
                const chosenId2 = adj2.chosenImdbId
                const meta = await fetchOmdbCached(chosenId2, omdbApiKey, omdbCache)
                const finalRuntimeCheck = scoreMatchCandidate(
                  { title: plannedTitle, sourceDurationMin },
                  {
                    imdbId: chosenId2,
                    title: meta?.Title || chosenId2,
                    runtimeMin: parseRuntimeMinutes(meta?.Runtime),
                  }
                )
                if (
                  !finalRuntimeCheck.flags.includes('runtime_feature_short_mismatch') &&
                  !finalRuntimeCheck.flags.includes('runtime_major_mismatch')
                ) {
                  await serializeDbWrite(async () => {
                    if (!dryRun) {
                      const mig = await migrateMovieId(movie.movieId, chosenId2)
                      if (mig.success && meta) {
                        upsertMetadataAndMovie(db, chosenId2, meta)
                      }
                    }
                    recordAttempt(
                      movie.movieId,
                      'matched',
                      candidates.length + freshList.length,
                      `Phase-2 planned LLM match (${chosenId2}, conf ${adj2.confidence})`
                    )
                  })
                  llmMatches++
                  plannedLlmMatches++
                  if (samples.length < 30) {
                    const chosenCand = scoredFresh.find(s => s.cand.imdbId === chosenId2)?.cand
                    samples.push({
                      oldMovieId: movie.movieId,
                      title: rawTitle,
                      action: 'llm_match',
                      imdbId: chosenId2,
                      matchedTitle: meta?.Title || chosenCand?.title || chosenId2,
                      confidence: adj2.confidence,
                      reason: `[Planned] ${adj2.reason}`,
                    })
                  }
                  return
                }
              }

              // If Phase 2 was uncertain with decent score, prefer queuing it over Pass 1
              if (adj2.verdict === 'uncertain' && scoredFresh[0]!.result.score >= 50) {
                pass1Top = scoredFresh[0]!
                pass1Adj = adj2
              }
            }
          }
        }

        // Queue ONLY uncertain medium-confidence items
        if (
          pass1Adj &&
          pass1Top &&
          pass1Adj.verdict === 'uncertain' &&
          pass1Top.result.score >= 50
        ) {
          const queuedTop = pass1Top
          const queuedAdj = pass1Adj
          queuedUncertain++
          await serializeDbWrite(() => {
            if (!dryRun) {
              enqueueReviewItem(db, {
                movieId: movie.movieId,
                kind: 'new_match',
                sourceId: movie.sourceId,
                currentImdbId: null,
                proposedImdbId: queuedAdj.chosenImdbId || queuedTop.cand.imdbId,
                score: queuedTop.result.score,
                llmVerdict: queuedAdj.verdict,
                llmConfidence: queuedAdj.confidence,
                llmReason: queuedAdj.reason,
                flags: queuedTop.result.flags,
                candidate: {
                  Title: queuedTop.cand.title,
                  Year: queuedTop.cand.year,
                  Runtime: queuedTop.cand.runtimeMinutes
                    ? `${queuedTop.cand.runtimeMinutes} min`
                    : undefined,
                  Director: queuedTop.cand.directors.join(', '),
                  Actors: queuedTop.cand.cast.join(', '),
                },
              })
            }
            recordAttempt(movie.movieId, 'queued', candidates.length, queuedAdj.reason)
          })
          if (samples.length < 30) {
            samples.push({
              oldMovieId: movie.movieId,
              title: rawTitle,
              action: 'queued',
              imdbId: queuedAdj.chosenImdbId || queuedTop.cand.imdbId,
              matchedTitle: queuedTop.cand.title,
              confidence: queuedAdj.confidence,
              reason: queuedAdj.reason,
            })
          }
        } else {
          await serializeDbWrite(() =>
            recordAttempt(
              movie.movieId,
              'no_match',
              candidates.length,
              pass1Adj?.reason || plan?.reason || 'No match after Phase 2 query planning'
            )
          )
          noMatch++
        }
      } catch (err) {
        errors++
        await serializeDbWrite(() =>
          recordAttempt(movie.movieId, 'error', 0, err instanceof Error ? err.message : String(err))
        )
        console.error(`[AutoMatch] Error processing ${movie.movieId}:`, err)
      } finally {
        scanned++
        emitProgress({
          type: 'audit',
          status: 'in_progress',
          current: scanned,
          total,
          message: `Matching: ${queryTitle} (matched: ${directUrlMatches + deterministicMatches + llmMatches})`,
          successCurrent: directUrlMatches + deterministicMatches + llmMatches,
          failedCurrent: noMatch + errors,
          estimatedTimeRemaining: computeEtaSeconds(startedAt, scanned, total),
        })
      }
    })

    emitProgress({
      type: 'audit',
      status: 'completed',
      current: scanned,
      total,
      message: `Auto-match ${dryRun ? '(dry run) ' : ''}complete: ${directUrlMatches + deterministicMatches + llmMatches} matched, ${queuedUncertain} uncertain queued`,
      successCurrent: directUrlMatches + deterministicMatches + llmMatches,
      failedCurrent: noMatch + errors,
    })

    return {
      task: 'match_unmatched',
      dryRun,
      scanned,
      directUrlMatches,
      deterministicMatches,
      llmMatches,
      plannedLlmMatches,
      notAMovie,
      queuedUncertain,
      noMatch,
      errors,
      samples,
    }
  } catch (error) {
    emitProgress({
      type: 'audit',
      status: 'error',
      current: scanned,
      total,
      message: error instanceof Error ? error.message : 'Auto-match failed',
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
