import Database from 'better-sqlite3'
import { join } from 'path'
import {
  extractYearFromTitle,
  parseRuntimeMinutes,
  scoreMatchCandidate,
} from '../server/utils/matchScorer'
import { analyzeArchiveSourceSize } from '../server/utils/archivePreviewDetector'

interface BenchMovieRow {
  movieId: string
  movieTitle: string
  movieYear: number | null
  verified: number
  omdbTitle: string | null
  omdbYear: string | null
  omdbRuntime: string | null
  omdbDirector: string | null
  omdbActors: string | null
  omdbType: string | null
  sourceId: string | null
  sourceTitle: string | null
  sourceDescription: string | null
  sourceSize: number | null
  sourceDuration: number | null
  sourceYear: number | null
}

function pct(num: number, den: number): string {
  if (den === 0) return 'N/A'
  return `${((num / den) * 100).toFixed(1)}%`
}

function main(): void {
  const dbPath = join(process.cwd(), 'data/movies.db')
  const db = new Database(dbPath, { readonly: true })

  console.log('=== Movies Deluxe Matching & Archive Preview Benchmark (Read-Only) ===\n')

  // 1. Verified matches (30)
  const verifiedRows = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, m.year as movieYear, m.verified,
        md.Title as omdbTitle, md.Year as omdbYear, md.Runtime as omdbRuntime,
        md.Director as omdbDirector, md.Actors as omdbActors, md.Type as omdbType,
        s.sourceId, s.title as sourceTitle, s.description as sourceDescription,
        s.size as sourceSize, s.duration as sourceDuration, s.year as sourceYear
      FROM movies m
      LEFT JOIN metadata md ON m.movieId = md.movieId
      LEFT JOIN sources s ON m.movieId = s.movieId
      WHERE m.movieId LIKE 'tt%' AND m.verified = 1 AND md.Title IS NOT NULL
      GROUP BY m.movieId
      LIMIT 30`
    )
    .all() as BenchMovieRow[]

  let verifiedAcceptedOrReview = 0
  let verifiedRejected = 0
  let verifiedScoreSum = 0

  for (const row of verifiedRows) {
    const rawTitle = row.sourceTitle || row.movieTitle
    const res = scoreMatchCandidate(
      {
        title: rawTitle,
        sourceYear: row.sourceYear,
        titleYear: extractYearFromTitle(rawTitle),
        sourceDurationMin: row.sourceDuration ? Math.round(row.sourceDuration / 60) : null,
      },
      {
        imdbId: row.movieId,
        title: row.omdbTitle || row.movieTitle,
        year: extractYearFromTitle(row.omdbYear) ?? row.movieYear,
        runtimeMin: parseRuntimeMinutes(row.omdbRuntime),
        director: row.omdbDirector,
        cast: row.omdbActors,
        type: row.omdbType,
      }
    )
    verifiedScoreSum += res.score
    if (res.tier === 'reject') {
      verifiedRejected++
    } else {
      verifiedAcceptedOrReview++
    }
  }

  console.log(`[1] Verified Matches (n=${verifiedRows.length}):`)
  console.log(
    `    Avg Score: ${verifiedRows.length ? (verifiedScoreSum / verifiedRows.length).toFixed(1) : 'N/A'}`
  )
  console.log(
    `    Kept (auto_accept/needs_review): ${verifiedAcceptedOrReview}/${verifiedRows.length} (${pct(verifiedAcceptedOrReview, verifiedRows.length)})`
  )
  console.log(
    `    False Rejects: ${verifiedRejected}/${verifiedRows.length} (${pct(verifiedRejected, verifiedRows.length)})\n`
  )

  // 2. Suspected runtime/year mismatches (25)
  const mismatchRows = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, m.year as movieYear, m.verified,
        md.Title as omdbTitle, md.Year as omdbYear, md.Runtime as omdbRuntime,
        md.Director as omdbDirector, md.Actors as omdbActors, md.Type as omdbType,
        s.sourceId, s.title as sourceTitle, s.description as sourceDescription,
        s.size as sourceSize, s.duration as sourceDuration, s.year as sourceYear
      FROM movies m
      JOIN metadata md ON m.movieId = md.movieId
      JOIN sources s ON m.movieId = s.movieId
      WHERE m.movieId LIKE 'tt%'
        AND m.verified = 0
        AND s.duration IS NOT NULL AND s.duration > 0
        AND md.Runtime LIKE '%min%'
        AND ABS((s.duration / 60.0) - CAST(REPLACE(md.Runtime, ' min', '') AS REAL)) > 35
      GROUP BY m.movieId
      LIMIT 25`
    )
    .all() as BenchMovieRow[]

  let mismatchFlagged = 0
  let mismatchAutoAccepted = 0

  for (const row of mismatchRows) {
    const rawTitle = row.sourceTitle || row.movieTitle
    const res = scoreMatchCandidate(
      {
        title: rawTitle,
        sourceYear: row.sourceYear,
        titleYear: extractYearFromTitle(rawTitle),
        sourceDurationMin: row.sourceDuration ? Math.round(row.sourceDuration / 60) : null,
      },
      {
        imdbId: row.movieId,
        title: row.omdbTitle || row.movieTitle,
        year: extractYearFromTitle(row.omdbYear) ?? row.movieYear,
        runtimeMin: parseRuntimeMinutes(row.omdbRuntime),
        director: row.omdbDirector,
        cast: row.omdbActors,
        type: row.omdbType,
      }
    )
    if (res.tier === 'auto_accept') mismatchAutoAccepted++
    if (res.tier === 'reject' || res.flags.length > 0) mismatchFlagged++
  }

  console.log(`[2] Suspected Runtime Mismatches (n=${mismatchRows.length}):`)
  console.log(
    `    Flagged/Rejected: ${mismatchFlagged}/${mismatchRows.length} (${pct(mismatchFlagged, mismatchRows.length)})`
  )
  console.log(`    Erroneous Auto-Accepts: ${mismatchAutoAccepted}/${mismatchRows.length}\n`)

  // 3. Archive.org small-size features (15) vs legit short cartoons (10)
  const smallFeatureRows = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, md.Runtime as omdbRuntime,
        s.sourceId, s.title as sourceTitle, s.description as sourceDescription,
        s.size as sourceSize, s.duration as sourceDuration
      FROM movies m
      JOIN metadata md ON m.movieId = md.movieId
      JOIN sources s ON m.movieId = s.movieId
      WHERE s.channelId = 'archive.org'
        AND s.size IS NOT NULL
        AND md.Runtime LIKE '%min%'
        AND CAST(REPLACE(md.Runtime, ' min', '') AS INTEGER) >= 50
        AND (s.size < 104857600 OR (s.size / 1048576.0) / CAST(REPLACE(md.Runtime, ' min', '') AS REAL) < 1.2)
      LIMIT 15`
    )
    .all() as BenchMovieRow[]

  let smallFeaturesFlagged = 0
  for (const row of smallFeatureRows) {
    const analysis = analyzeArchiveSourceSize({
      sourceId: row.sourceId || row.movieId,
      title: row.sourceTitle || row.movieTitle,
      description: row.sourceDescription,
      sizeBytes: row.sourceSize,
      runtimeMinutes: parseRuntimeMinutes(row.omdbRuntime),
      durationSeconds: row.sourceDuration,
    })
    if (analysis.isLikelyPreview) smallFeaturesFlagged++
  }

  const legitShortsRows = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, md.Runtime as omdbRuntime,
        s.sourceId, s.title as sourceTitle, s.description as sourceDescription,
        s.size as sourceSize, s.duration as sourceDuration
      FROM movies m
      JOIN metadata md ON m.movieId = md.movieId
      JOIN sources s ON m.movieId = s.movieId
      WHERE s.channelId = 'archive.org'
        AND s.size IS NOT NULL AND s.size >= 10485760
        AND md.Runtime LIKE '%min%'
        AND CAST(REPLACE(md.Runtime, ' min', '') AS INTEGER) BETWEEN 3 AND 25
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%preview%'
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%trailer%'
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%teaser%'
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%clip%'
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%sample%'
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%review%'
        AND LOWER(COALESCE(s.sourceId, '') || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) NOT LIKE '%subtitle%'
      LIMIT 10`
    )
    .all() as BenchMovieRow[]

  let legitShortsFalsePositives = 0
  for (const row of legitShortsRows) {
    const analysis = analyzeArchiveSourceSize({
      sourceId: row.sourceId || row.movieId,
      title: row.sourceTitle || row.movieTitle,
      description: row.sourceDescription,
      sizeBytes: row.sourceSize,
      runtimeMinutes: parseRuntimeMinutes(row.omdbRuntime),
      durationSeconds: row.sourceDuration,
    })
    if (analysis.isLikelyPreview) {
      legitShortsFalsePositives++
      console.log(
        `    [FP] ${row.sourceId} (${row.omdbRuntime}, ${analysis.sizeMB} MB, flags=${analysis.flags.join(',')})`
      )
    }
  }

  console.log(`[3] Archive.org Preview Detection:`)
  console.log(
    `    Small-Size Features Caught: ${smallFeaturesFlagged}/${smallFeatureRows.length} (${pct(smallFeaturesFlagged, smallFeatureRows.length)})`
  )
  console.log(
    `    Legit Short Cartoons False Positives: ${legitShortsFalsePositives}/${legitShortsRows.length} (${pct(legitShortsFalsePositives, legitShortsRows.length)})\n`
  )

  // 4. Unmatched movies (20) tested against wrong-year / word-overlap-only synthetic candidates
  const unmatchedRows = db
    .prepare(
      `SELECT
        m.movieId, m.title as movieTitle, m.year as movieYear,
        s.sourceId, s.title as sourceTitle, s.duration as sourceDuration, s.year as sourceYear
      FROM movies m
      LEFT JOIN sources s ON m.movieId = s.movieId
      WHERE m.movieId NOT LIKE 'tt%'
      GROUP BY m.movieId
      LIMIT 20`
    )
    .all() as BenchMovieRow[]

  let unmatchedNoEvidenceAutoAccept = 0
  for (const row of unmatchedRows) {
    const rawTitle = row.sourceTitle || row.movieTitle
    // Test word-overlap-only candidate without supporting year/runtime/people evidence
    const res = scoreMatchCandidate(
      {
        title: rawTitle,
        sourceYear: null,
        titleYear: null,
        sourceDurationMin: null,
      },
      {
        imdbId: 'tt0000000',
        title: row.movieTitle,
        year: null,
        runtimeMin: null,
      }
    )
    if (res.tier === 'auto_accept') unmatchedNoEvidenceAutoAccept++
  }

  console.log(`[4] Unmatched Movies Guardrail (n=${unmatchedRows.length}):`)
  console.log(
    `    Auto-Accepts Without Supporting Evidence: ${unmatchedNoEvidenceAutoAccept}/${unmatchedRows.length}`
  )

  const totalSampled =
    verifiedRows.length +
    mismatchRows.length +
    smallFeatureRows.length +
    legitShortsRows.length +
    unmatchedRows.length
  console.log(`\nTotal Sampled: ${totalSampled} movies`)

  db.close()
}

main()
