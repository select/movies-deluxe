/**
 * Automated Movie Matching, False-Hit Remediation & Archive.org Preview Cleanup Pipeline
 *
 * Shared by both CLI (`scripts/auto-pipeline.ts`) and Admin API (`server/api/admin/auto/run.post.ts`).
 * Emits real-time SSE progress via `emitProgress({ type: 'audit', ... })`.
 */

import 'dotenv/config'
import type Database from 'better-sqlite3'
import { getAdminDatabase, withTransaction } from './adminDb'
import { analyzeArchiveSourceSize } from './archivePreviewDetector'
import { extractImdbIdFromText, retrieveCandidates } from './candidateRetriever'
import { enqueueReviewItem } from './matchReviewQueue'
import { extractYearFromTitle, parseRuntimeMinutes, scoreMatchCandidate } from './matchScorer'
import { adjudicateCandidates, verifyMatchCandidate } from './matchVerifier'
import { migrateMovieId } from './migrateMovieId'
import { getMovieByImdbId } from './omdb'
import { emitProgress } from './progress'
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

export interface AutoMatchUnmatchedOptions {
  dryRun?: boolean
  limit?: number
  channel?: string
  minConfidence?: number
  allowGoogle?: boolean
  model?: string
}

export interface AutoMatchUnmatchedResult {
  task: 'match_unmatched'
  dryRun: boolean
  scanned: number
  directUrlMatches: number
  deterministicMatches: number
  llmMatches: number
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
  const omdbApiKey = process.env.OMDB_API_KEY

  const db = getAdminDatabase()
  const verifiedFilter = includeVerified ? '' : 'AND m.verified = 0'

  const movies = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, m.year as movieYear,
        md.Title as omdbTitle, md.Year as omdbYear, md.Runtime as omdbRuntime,
        md.Director as omdbDirector, md.Actors as omdbActors, md.Plot as omdbPlot, md.Type as omdbType
      FROM movies m
      LEFT JOIN metadata md ON m.movieId = md.movieId
      WHERE m.movieId LIKE 'tt%'
        ${verifiedFilter}
      ORDER BY m.lastUpdated DESC
      LIMIT ?`
    )
    .all(safeLimit) as Array<{
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
  }>

  const getSourcesStmt = db.prepare(
    `SELECT s.id, s.movieId, s.sourceId, s.channelId, c.platform, c.name as channelName,
            s.title, s.description, s.size, s.duration, s.year
     FROM sources s
     JOIN channels c ON s.channelId = c.id
     WHERE s.movieId = ?`
  )

  const total = movies.length
  let scanned = 0
  let deterministicFlagged = 0
  let llmKept = 0
  let autoRematched = 0
  let autoUnmatched = 0
  let queuedUncertain = 0
  const samples: AutoAuditFalseHitsResult['samples'] = []

  emitProgress({
    type: 'audit',
    status: 'starting',
    current: 0,
    total,
    message: `Starting ${dryRun ? 'dry-run ' : ''}auto false-hit audit (${total} movies)...`,
    successCurrent: 0,
    failedCurrent: 0,
  })

  try {
    for (const movie of movies) {
      scanned++
      const sources = getSourcesStmt.all(movie.movieId) as SourceRow[]
      const primarySource = sources[0]
      if (!primarySource) continue

      const candidateTitle = movie.omdbTitle || movie.movieTitle
      const candidateYear = extractYearFromTitle(movie.omdbYear) ?? movie.movieYear ?? null
      const candidateRuntimeMin = parseRuntimeMinutes(movie.omdbRuntime)
      const rawSourceTitle = primarySource.title || movie.movieTitle
      const sourceDurationMin =
        primarySource.duration && primarySource.duration > 0
          ? Math.round(primarySource.duration / 60)
          : null

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
        if (scanned % 50 === 0 || scanned === total) {
          emitProgress({
            type: 'audit',
            status: 'in_progress',
            current: scanned,
            total,
            message: `Scanning: ${candidateTitle} (flagged: ${deterministicFlagged}, fixed: ${autoRematched + autoUnmatched})`,
            successCurrent: autoRematched + autoUnmatched + llmKept,
            failedCurrent: queuedUncertain,
          })
        }
        continue
      }

      deterministicFlagged++
      emitProgress({
        type: 'audit',
        status: 'in_progress',
        current: scanned,
        total,
        message: `LLM verifying: ${candidateTitle} (${deterministicFlagged} flagged)`,
        successCurrent: autoRematched + autoUnmatched + llmKept,
        failedCurrent: queuedUncertain,
      })

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
        continue
      }

      // High-confidence MISMATCH -> try auto-rematch, else auto-unmatch
      if (verdict.verdict === 'mismatch' && verdict.confidence >= minConfidence) {
        let replacementId: string | null = null
        let replacementMeta: MovieMetadata | null = null

        if (rematch) {
          const queryTitle = rawSourceTitle
          const queryYear = primarySource.year ?? extractYearFromTitle(rawSourceTitle) ?? undefined
          const candidates = await retrieveCandidates(
            {
              title: queryTitle,
              year: queryYear,
              description: primarySource.description || undefined,
            },
            { limit: 6, omdbApiKey, allowGoogleFallback: allowGoogle }
          )
          const filtered = candidates.filter(c => c.imdbId !== movie.movieId)
          if (filtered.length > 0) {
            const adj = await adjudicateCandidates(
              {
                movieId: movie.movieId,
                title: rawSourceTitle,
                year: queryYear ?? null,
                durationMin: sourceDurationMin,
                description: primarySource.description,
                channelName: primarySource.channelName,
              },
              filtered.slice(0, 5).map(c => ({
                imdbId: c.imdbId,
                title: c.title,
                year: c.year ?? null,
                runtimeMin: c.runtimeMinutes ?? null,
                director: c.directors.join(', ') || null,
                actors: c.cast.join(', ') || null,
                plot: c.overview ?? null,
                type: c.titleType ?? null,
              })),
              { model }
            )

            if (adj.chosenImdbId && adj.verdict === 'match' && adj.confidence >= 0.9) {
              const meta = omdbApiKey
                ? await getMovieByImdbId(adj.chosenImdbId, omdbApiKey).catch(() => null)
                : null
              const newRuntimeMin = parseRuntimeMinutes(meta?.Runtime)
              const runtimeCheck = scoreMatchCandidate(
                { title: rawSourceTitle, sourceDurationMin },
                {
                  imdbId: adj.chosenImdbId,
                  title: meta?.Title || adj.chosenImdbId,
                  runtimeMin: newRuntimeMin,
                }
              )
              if (
                !runtimeCheck.flags.includes('runtime_feature_short_mismatch') &&
                !runtimeCheck.flags.includes('runtime_major_mismatch')
              ) {
                replacementId = adj.chosenImdbId
                replacementMeta = meta
              }
            }
          }
        }

        if (replacementId && isImdbId(replacementId)) {
          autoRematched++
          if (!dryRun) {
            const mig = await migrateMovieId(movie.movieId, replacementId)
            if (mig.success && replacementMeta) {
              upsertMetadataAndMovie(db, replacementId, replacementMeta)
            }
          }
          if (samples.length < 30) {
            samples.push({
              movieId: movie.movieId,
              title: candidateTitle,
              action: 'rematched',
              newMovieId: replacementId,
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
            db.prepare('DELETE FROM metadata WHERE movieId = ?').run(movie.movieId)
            await migrateMovieId(movie.movieId, tempId)
            db.prepare(
              'UPDATE movies SET title = ?, verified = 0, lastUpdated = ? WHERE movieId = ?'
            ).run(rawSourceTitle, new Date().toISOString(), tempId)
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
        continue
      }

      // Uncertain -> enqueue ONLY these for human review
      queuedUncertain++
      if (!dryRun) {
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
    }

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
  const omdbApiKey = process.env.OMDB_API_KEY

  const db = getAdminDatabase()
  const params: unknown[] = []
  let channelClause = ''
  if (options.channel && options.channel.trim()) {
    channelClause = 'AND (c.id = ? OR lower(c.name) = lower(?))'
    params.push(options.channel.trim(), options.channel.trim())
  }
  params.push(safeLimit)

  const movies = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, m.year as movieYear,
        s.sourceId, s.title as sourceTitle, s.description as sourceDescription,
        s.duration as sourceDuration, s.year as sourceYear,
        c.name as channelName, c.platform
      FROM movies m
      JOIN sources s ON m.movieId = s.movieId
      JOIN channels c ON s.channelId = c.id
      WHERE m.movieId NOT LIKE 'tt%'
        ${channelClause}
      GROUP BY m.movieId
      ORDER BY m.lastUpdated DESC
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
    channelName: string
    platform: string
  }>

  const total = movies.length
  let scanned = 0
  let directUrlMatches = 0
  let deterministicMatches = 0
  let llmMatches = 0
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

  try {
    for (const movie of movies) {
      scanned++
      const rawTitle = movie.sourceTitle || movie.movieTitle
      const queryTitle = rawTitle
      const queryYear =
        movie.sourceYear ?? movie.movieYear ?? extractYearFromTitle(rawTitle) ?? undefined
      const sourceDurationMin =
        movie.sourceDuration && movie.sourceDuration > 0
          ? Math.round(movie.sourceDuration / 60)
          : null

      emitProgress({
        type: 'audit',
        status: 'in_progress',
        current: scanned,
        total,
        message: `Matching: ${queryTitle} (matched: ${directUrlMatches + deterministicMatches + llmMatches})`,
        successCurrent: directUrlMatches + deterministicMatches + llmMatches,
        failedCurrent: noMatch + errors,
      })

      try {
        // Pass 1: Direct tt* in description
        const directId = extractImdbIdFromText(movie.sourceDescription || undefined)
        if (directId) {
          const meta = omdbApiKey
            ? await getMovieByImdbId(directId, omdbApiKey).catch(() => null)
            : null
          if (!dryRun) {
            const mig = await migrateMovieId(movie.movieId, directId)
            if (mig.success && meta) {
              upsertMetadataAndMovie(db, directId, meta)
            }
          }
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
          continue
        }

        // Pass 2: Tiered multi-source retrieval
        const candidates = await retrieveCandidates(
          {
            title: queryTitle,
            year: queryYear,
            description: movie.sourceDescription || undefined,
          },
          {
            limit: 6,
            omdbApiKey,
            allowGoogleFallback: allowGoogle,
          }
        )

        if (candidates.length === 0) {
          noMatch++
          continue
        }

        // Pass 3: Deterministic scoring
        const scored = candidates
          .map(cand => ({
            cand,
            result: scoreMatchCandidate(
              {
                title: rawTitle,
                sourceYear: movie.sourceYear,
                titleYear: extractYearFromTitle(rawTitle),
                sourceDurationMin,
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

        const top = scored[0]!
        const second = scored[1]

        // Auto-accept deterministic high confidence without LLM call
        if (
          top.result.tier === 'auto_accept' &&
          (!second || top.result.score - second.result.score >= 10)
        ) {
          const meta = omdbApiKey
            ? await getMovieByImdbId(top.cand.imdbId, omdbApiKey).catch(() => null)
            : null
          if (!dryRun) {
            const mig = await migrateMovieId(movie.movieId, top.cand.imdbId)
            if (mig.success && meta) {
              upsertMetadataAndMovie(db, top.cand.imdbId, meta)
            }
          }
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
          continue
        }

        // Ambiguous -> LLM adjudicator
        const nonRejected = scored.filter(s => s.result.tier !== 'reject').slice(0, 5)
        if (nonRejected.length === 0) {
          noMatch++
          continue
        }

        const adj = await adjudicateCandidates(
          {
            movieId: movie.movieId,
            title: rawTitle,
            year: queryYear ?? null,
            durationMin: sourceDurationMin,
            description: movie.sourceDescription,
            channelName: movie.channelName,
          },
          nonRejected.map(s => ({
            imdbId: s.cand.imdbId,
            title: s.cand.title,
            year: s.cand.year ?? null,
            runtimeMin: s.cand.runtimeMinutes ?? null,
            director: s.cand.directors.join(', ') || null,
            actors: s.cand.cast.join(', ') || null,
            plot: s.cand.overview ?? null,
            type: s.cand.titleType ?? null,
          })),
          { model }
        )

        if (adj.chosenImdbId && adj.verdict === 'match' && adj.confidence >= minConfidence) {
          const meta = omdbApiKey
            ? await getMovieByImdbId(adj.chosenImdbId, omdbApiKey).catch(() => null)
            : null
          const finalRuntimeCheck = scoreMatchCandidate(
            { title: rawTitle, sourceDurationMin },
            {
              imdbId: adj.chosenImdbId,
              title: meta?.Title || adj.chosenImdbId,
              runtimeMin: parseRuntimeMinutes(meta?.Runtime),
            }
          )
          if (
            !finalRuntimeCheck.flags.includes('runtime_feature_short_mismatch') &&
            !finalRuntimeCheck.flags.includes('runtime_major_mismatch')
          ) {
            if (!dryRun) {
              const mig = await migrateMovieId(movie.movieId, adj.chosenImdbId)
              if (mig.success && meta) {
                upsertMetadataAndMovie(db, adj.chosenImdbId, meta)
              }
            }
            llmMatches++
            if (samples.length < 30) {
              samples.push({
                oldMovieId: movie.movieId,
                title: rawTitle,
                action: 'llm_match',
                imdbId: adj.chosenImdbId,
                matchedTitle: meta?.Title || top.cand.title,
                confidence: adj.confidence,
                reason: adj.reason,
              })
            }
            continue
          }
        }

        // Queue ONLY uncertain medium-confidence items
        if (adj.verdict === 'uncertain' && top.result.score >= 50) {
          queuedUncertain++
          if (!dryRun) {
            enqueueReviewItem(db, {
              movieId: movie.movieId,
              kind: 'new_match',
              sourceId: movie.sourceId,
              currentImdbId: null,
              proposedImdbId: adj.chosenImdbId || top.cand.imdbId,
              score: top.result.score,
              llmVerdict: adj.verdict,
              llmConfidence: adj.confidence,
              llmReason: adj.reason,
              flags: top.result.flags,
              candidate: {
                Title: top.cand.title,
                Year: top.cand.year,
                Runtime: top.cand.runtimeMinutes ? `${top.cand.runtimeMinutes} min` : undefined,
                Director: top.cand.directors.join(', '),
                Actors: top.cand.cast.join(', '),
              },
            })
          }
          if (samples.length < 30) {
            samples.push({
              oldMovieId: movie.movieId,
              title: rawTitle,
              action: 'queued',
              imdbId: adj.chosenImdbId || top.cand.imdbId,
              matchedTitle: top.cand.title,
              confidence: adj.confidence,
              reason: adj.reason,
            })
          }
        } else {
          noMatch++
        }
      } catch (err) {
        errors++
        console.error(`[AutoMatch] Error processing ${movie.movieId}:`, err)
      }
    }

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
