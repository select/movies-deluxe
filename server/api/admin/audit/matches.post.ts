import { defineEventHandler, readBody } from 'h3'
import { getAdminDatabase } from '#server/utils/adminDb'
import {
  extractYearFromTitle,
  parseRuntimeMinutes,
  scoreMatchCandidate,
} from '#server/utils/matchScorer'
import { verifyMatchCandidate } from '#server/utils/matchVerifier'
import {
  analyzeArchiveSourceSize,
  fetchArchiveVideoLength,
} from '#server/utils/archivePreviewDetector'
import { enqueueReviewItem } from '#server/utils/matchReviewQueue'
import { emitProgress } from '#server/utils/progress'

interface AuditMatchesBody {
  limit?: number
  dryRun?: boolean
  includeVerified?: boolean
  useLlm?: boolean
  checkArchivePreviews?: boolean
  verifyArchiveMetadata?: boolean
  model?: string
}

interface MatchedMovieRow {
  movieId: string
  movieTitle: string
  movieYear: number | null
  verified: number
  omdbTitle: string | null
  omdbYear: string | null
  omdbRuntime: string | null
  omdbDirector: string | null
  omdbActors: string | null
  omdbPlot: string | null
  omdbType: string | null
}

interface SourceRow {
  sourceId: string
  channelId: string
  platform: string
  channelName: string
  title: string | null
  description: string | null
  size: number | null
  duration: number | null
  year: number | null
  isIncomplete: number
}

export default defineEventHandler(async event => {
  const body: AuditMatchesBody =
    (await readBody<AuditMatchesBody>(event).catch(() => ({}) as AuditMatchesBody)) || {}
  const {
    limit = 200,
    dryRun = true,
    includeVerified = false,
    useLlm = false,
    checkArchivePreviews = true,
    verifyArchiveMetadata = false,
    model,
  } = body

  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 200))
  const db = getAdminDatabase()

  const verifiedFilter = includeVerified ? '' : 'AND m.verified = 0'
  const movies = db
    .prepare(
      `SELECT
        m.movieId,
        m.title as movieTitle,
        m.year as movieYear,
        m.verified,
        md.Title as omdbTitle,
        md.Year as omdbYear,
        md.Runtime as omdbRuntime,
        md.Director as omdbDirector,
        md.Actors as omdbActors,
        md.Plot as omdbPlot,
        md.Type as omdbType
      FROM movies m
      LEFT JOIN metadata md ON m.movieId = md.movieId
      WHERE m.movieId LIKE 'tt%'
        ${verifiedFilter}
      ORDER BY m.lastUpdated DESC
      LIMIT ?`
    )
    .all(safeLimit) as MatchedMovieRow[]

  const getSourcesStmt = db.prepare(
    `SELECT
      s.sourceId,
      s.channelId,
      c.platform,
      c.name as channelName,
      s.title,
      s.description,
      s.size,
      s.duration,
      s.year,
      EXISTS (
        SELECT 1 FROM source_quality_marks sqm
        WHERE sqm.sourceId = s.id AND sqm.mark = 'incomplete'
      ) as isIncomplete
    FROM sources s
    JOIN channels c ON s.channelId = c.id
    WHERE s.movieId = ?`
  )

  let scanned = 0
  let flaggedFalseHits = 0
  let flaggedArchivePreviews = 0
  let llmVerified = 0
  let enqueued = 0
  const total = movies.length

  emitProgress({
    type: 'audit',
    status: 'starting',
    current: 0,
    total,
    message: `Starting ${dryRun ? 'dry-run ' : ''}audit of ${total} matched movies...`,
    successCurrent: 0,
    failedCurrent: 0,
  })

  const samples: Array<{
    kind: 'false_hit' | 'archive_preview'
    movieId: string
    sourceId: string | null
    title: string
    score: number | null
    flags: string[]
    llmVerdict?: string | null
    llmReason?: string | null
  }> = []

  const progressInterval = useLlm || verifyArchiveMetadata ? 1 : 25

  try {
    for (const movie of movies) {
      scanned++
      if (scanned === 1 || scanned % progressInterval === 0 || scanned === total) {
        emitProgress({
          type: 'audit',
          status: 'in_progress',
          current: scanned,
          total,
          message: `${movie.omdbTitle || movie.movieTitle} (${flaggedFalseHits} false hits, ${flaggedArchivePreviews} previews)`,
          successCurrent: flaggedFalseHits + flaggedArchivePreviews,
          failedCurrent: enqueued,
        })
      }
      const sources = getSourcesStmt.all(movie.movieId) as SourceRow[]
      const primarySource = sources[0]

      const candidateTitle = movie.omdbTitle || movie.movieTitle
      const candidateYear = extractYearFromTitle(movie.omdbYear) ?? movie.movieYear ?? null
      const candidateRuntimeMin = parseRuntimeMinutes(movie.omdbRuntime)

      // 1. Deterministic false-hit check
      const rawSourceTitle = primarySource?.title || movie.movieTitle
      const sourceDurationMin =
        primarySource?.duration && primarySource.duration > 0
          ? Math.round(primarySource.duration / 60)
          : null

      const scoreResult = scoreMatchCandidate(
        {
          title: rawSourceTitle,
          sourceYear: primarySource?.year ?? null,
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

      const isFalseHit =
        scoreResult.tier === 'reject' ||
        (scoreResult.tier === 'needs_review' &&
          scoreResult.score < 60 &&
          scoreResult.flags.some(
            f => f !== 'no_supporting_evidence' && f !== 'title_partial_similarity'
          ))

      if (isFalseHit) {
        flaggedFalseHits++
        let llmVerdict: 'match' | 'mismatch' | 'uncertain' | null = null
        let llmConfidence: number | null = null
        let llmReason: string | null = null

        if (useLlm) {
          const verification = await verifyMatchCandidate(
            {
              movieId: movie.movieId,
              title: rawSourceTitle,
              year: primarySource?.year ?? null,
              durationMin: sourceDurationMin,
              description: primarySource?.description ?? null,
              channelName: primarySource?.channelName ?? null,
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
          llmVerified++
          llmVerdict = verification.verdict
          llmConfidence = verification.confidence
          llmReason = verification.reason
        }

        if (!dryRun) {
          enqueueReviewItem(db, {
            movieId: movie.movieId,
            kind: 'false_hit',
            sourceId: primarySource?.sourceId ?? null,
            currentImdbId: movie.movieId,
            proposedImdbId: null,
            score: scoreResult.score,
            llmVerdict,
            llmConfidence,
            llmReason,
            flags: scoreResult.flags,
            candidate: {
              omdbTitle: candidateTitle,
              omdbYear: candidateYear,
              omdbRuntime: movie.omdbRuntime,
              sourceTitle: rawSourceTitle,
              breakdown: scoreResult.breakdown,
            },
          })
          enqueued++
        }

        if (samples.length < 30) {
          samples.push({
            kind: 'false_hit',
            movieId: movie.movieId,
            sourceId: primarySource?.sourceId ?? null,
            title: candidateTitle,
            score: scoreResult.score,
            flags: scoreResult.flags,
            llmVerdict,
            llmReason,
          })
        }
      }

      // 2. Archive.org preview detection (size + film length)
      if (checkArchivePreviews) {
        const archiveSources = sources.filter(
          s => (s.platform === 'archive.org' || s.channelId === 'archive.org') && !s.isIncomplete
        )

        for (const arch of archiveSources) {
          const analysis = analyzeArchiveSourceSize({
            sourceId: arch.sourceId,
            title: arch.title,
            description: arch.description,
            sizeBytes: arch.size,
            runtimeMinutes: candidateRuntimeMin,
            durationSeconds: arch.duration,
          })

          if (!analysis.isLikelyPreview) continue

          const flags = [...analysis.flags]
          let confirmedLengthMin: number | null = null

          if (verifyArchiveMetadata) {
            const meta = await fetchArchiveVideoLength(arch.sourceId, candidateRuntimeMin)
            confirmedLengthMin = meta.longestVideoMinutes
            if (meta.hasVideoFile === false) {
              flags.push('no_video_file')
            } else if (meta.confirmedPreview) {
              flags.push('confirmed_short_archive_video')
            }
          }

          flaggedArchivePreviews++

          if (!dryRun) {
            enqueueReviewItem(db, {
              movieId: movie.movieId,
              kind: 'archive_preview',
              sourceId: arch.sourceId,
              currentImdbId: movie.movieId,
              proposedImdbId: null,
              score: analysis.mbPerMin,
              flags,
              candidate: {
                sourceTitle: arch.title,
                omdbTitle: candidateTitle,
                sizeMB: analysis.sizeMB,
                runtimeMinutes: analysis.runtimeMinutes,
                mbPerMin: analysis.mbPerMin,
                confirmedLengthMin,
                reason: analysis.reason,
              },
            })
            enqueued++
          }

          if (samples.length < 30) {
            samples.push({
              kind: 'archive_preview',
              movieId: movie.movieId,
              sourceId: arch.sourceId,
              title: arch.title || candidateTitle,
              score: analysis.mbPerMin,
              flags,
            })
          }
        }
      }
    }

    emitProgress({
      type: 'audit',
      status: 'completed',
      current: scanned,
      total,
      message: `Audit ${dryRun ? '(dry run) ' : ''}complete: ${flaggedFalseHits} false hits, ${flaggedArchivePreviews} archive previews`,
      successCurrent: flaggedFalseHits + flaggedArchivePreviews,
      failedCurrent: enqueued,
    })

    return {
      success: true,
      scanned,
      flagged: flaggedFalseHits + flaggedArchivePreviews,
      flaggedFalseHits,
      flaggedArchivePreviews,
      byKind: {
        false_hit: flaggedFalseHits,
        archive_preview: flaggedArchivePreviews,
      },
      llmVerified,
      enqueued,
      dryRun,
      samples,
    }
  } catch (error) {
    emitProgress({
      type: 'audit',
      status: 'error',
      current: scanned,
      total,
      message: error instanceof Error ? error.message : 'Audit failed',
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
})
