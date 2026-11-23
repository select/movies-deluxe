import { OpenRouter } from '@openrouter/sdk'
import {
  classifyWithJev,
  isJevAvailable,
  type JevChoiceAnswer,
  type JevNoulAnswer,
} from './jevClient'
import type { LlmVerdict } from '../../shared/types/match-review'

export interface VerifierSourceInput {
  movieId?: string
  sourceId?: string | null
  title: string
  originalTitle?: string | null
  altTitles?: string[] | null
  year?: number | null
  durationMin?: number | null
  director?: string | null
  cast?: string[] | null
  description?: string | null
  channelName?: string | null
}

export interface VerifierCandidateInput {
  imdbId: string
  title: string
  year?: number | null
  runtimeMin?: number | null
  director?: string | null
  actors?: string | null
  plot?: string | null
  type?: string | null
}

export interface VerifierOptions {
  apiKey?: string
  model?: string
}

export interface VerifyMatchResult {
  verdict: LlmVerdict
  confidence: number
  reason: string
  provider?: 'jev' | 'openrouter'
  model?: string
}

export interface AdjudicateCandidatesResult {
  chosenImdbId: string | null
  verdict: LlmVerdict
  confidence: number
  reason: string
  isNotAMovie?: boolean
  provider?: 'jev' | 'openrouter'
  model?: string
}

export interface QueryPlanResult {
  isMovie: boolean
  cleanTitle: string | null
  originalTitle: string | null
  englishTitle: string | null
  year: number | null
  director: string | null
  cast: string[]
  searchQueries: string[]
  webQueries: string[]
  reason: string
}

const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite'
const FALLBACK_MODEL = 'openai/gpt-4o-mini'

function getApiKey(opts?: VerifierOptions): string | undefined {
  return opts?.apiKey || process.env.OPENROUTER_API_KEY
}

function isOpenRouterAvailable(opts?: VerifierOptions): boolean {
  return Boolean(getApiKey(opts)?.trim())
}

export function isMatchVerifierAvailable(opts?: VerifierOptions): boolean {
  return isJevAvailable() || isOpenRouterAvailable(opts)
}

function createOpenRouterClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: 'https://movies-deluxe.local',
    appTitle: 'Movies Deluxe',
  })
}

async function sendPromptWithRetry(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string | null> {
  const client = createOpenRouterClient(apiKey)
  const modelsToTry = model === FALLBACK_MODEL ? [model] : [model, model, FALLBACK_MODEL]
  const delaysMs = [1500, 2500]
  let lastError: unknown

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const activeModel = modelsToTry[attempt]!
    try {
      const completion = await client.chat.send({
        chatRequest: {
          model: activeModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        },
      })
      const rawContent = completion.choices?.[0]?.message?.content
      if (typeof rawContent === 'string' && rawContent.trim()) {
        return rawContent
      }
      lastError = new Error('Empty response from LLM')
    } catch (error) {
      lastError = error
    }
    if (attempt < delaysMs.length) {
      await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]))
    }
  }
  throw lastError
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function normalizeVerdict(val: unknown): LlmVerdict {
  if (val === 'match' || val === 'mismatch' || val === 'uncertain') {
    return val
  }
  return 'uncertain'
}

function normalizeConfidence(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0
  return Math.max(0, Math.min(1, Number(val.toFixed(3))))
}

function formatSourceSummary(source: VerifierSourceInput, maxDescChars = 800): string {
  const lines = [
    `Raw Title: ${source.title}`,
    source.sourceId ? `Source ID / Slug: ${source.sourceId}` : null,
    source.originalTitle ? `Original Title: ${source.originalTitle}` : null,
    source.altTitles?.length ? `Alt Titles: ${source.altTitles.join(', ')}` : null,
    source.year ? `Year: ${source.year}` : null,
    source.durationMin ? `Duration: ${source.durationMin} min` : null,
    source.director ? `Director: ${source.director}` : null,
    source.cast?.length ? `Cast: ${source.cast.join(', ')}` : null,
    source.channelName ? `Channel: ${source.channelName}` : null,
    source.description ? `Description: ${source.description.slice(0, maxDescChars)}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}

function formatCandidateSummary(c: VerifierCandidateInput): string {
  const lines = [
    `IMDb ID: ${c.imdbId}`,
    `Title: ${c.title}`,
    c.year ? `Year: ${c.year}` : null,
    c.runtimeMin ? `Runtime: ${c.runtimeMin} min` : null,
    c.type ? `Type: ${c.type}` : null,
    c.director ? `Director: ${c.director}` : null,
    c.actors ? `Actors: ${c.actors}` : null,
    c.plot ? `Plot: ${c.plot.slice(0, 300)}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * Verify whether a single IMDb/OMDb candidate matches a source upload.
 */
export async function verifyMatchCandidate(
  source: VerifierSourceInput,
  candidate: VerifierCandidateInput,
  opts?: VerifierOptions
): Promise<VerifyMatchResult> {
  if (!opts?.model && isJevAvailable()) {
    try {
      const res = await classifyWithJev(
        {
          source: {
            rawTitle: source.title,
            originalTitle: source.originalTitle || undefined,
            altTitles: source.altTitles?.length ? source.altTitles : undefined,
            year: source.year ?? undefined,
            durationMin: source.durationMin ?? undefined,
            director: source.director || undefined,
            cast: source.cast?.length ? source.cast : undefined,
            channelName: source.channelName || undefined,
            description: source.description ? source.description.slice(0, 600) : undefined,
          },
          candidate: {
            imdbId: candidate.imdbId,
            title: candidate.title,
            year: candidate.year ?? undefined,
            runtimeMin: candidate.runtimeMin ?? undefined,
            type: candidate.type || undefined,
            director: candidate.director || undefined,
            actors: candidate.actors || undefined,
            plot: candidate.plot ? candidate.plot.slice(0, 300) : undefined,
          },
        },
        {
          isSameMovie: {
            type: 'noul',
            instructions:
              'Determine whether the uploaded video source and the IMDb candidate refer to the SAME film. Account for localized/translated titles, YouTube promo/rip tags, and YouTube upload years vs true release years. Reject wrong remakes, TV episodes, clips/newsreels, or major runtime mismatches (e.g. feature vs short). Missing source duration is normal.',
            criteria: {
              true: 'The source video and IMDb candidate are the same film.',
              false:
                'They are different films, a wrong remake, a TV episode, a non-movie clip, or have a major runtime/plot mismatch.',
            },
          },
        }
      )

      const ans = res.answers.isSameMovie as JevNoulAnswer | undefined
      if (ans && typeof ans.noul === 'number' && Number.isFinite(ans.noul)) {
        const prob = Math.max(0, Math.min(1, ans.noul))
        if (prob >= 0.85) {
          return {
            verdict: 'match',
            confidence: Number(prob.toFixed(2)),
            reason: `Jev match (${Math.round(prob * 100)}%)`,
            provider: 'jev',
            model: res.model,
          }
        }
        if (prob <= 0.2) {
          return {
            verdict: 'mismatch',
            confidence: Number((1 - prob).toFixed(2)),
            reason: `Jev mismatch (${Math.round((1 - prob) * 100)}%)`,
            provider: 'jev',
            model: res.model,
          }
        }
        if (!isOpenRouterAvailable(opts)) {
          return {
            verdict: 'uncertain',
            confidence: Number(prob.toFixed(2)),
            reason: `Jev uncertain (${Math.round(prob * 100)}%)`,
            provider: 'jev',
            model: res.model,
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`[MatchVerifier] Jev verifyMatchCandidate fallback to OpenRouter: ${msg}`)
    }
  }

  const apiKey = getApiKey(opts)
  if (!apiKey) {
    return {
      verdict: 'uncertain',
      confidence: 0,
      reason: 'OPENROUTER_API_KEY not configured',
    }
  }

  const model = opts?.model || DEFAULT_MODEL
  const prompt = [
    'You are a film metadata verification expert. Determine whether the uploaded video source and the IMDb candidate refer to the SAME film.',
    'Pay close attention to title (including translations/AKAs), release year, runtime (a 90-min feature vs a 7-min short or vice versa is a mismatch), director/cast, and plot.',
    'Missing source duration/runtime is normal (e.g., Archive.org items often omit duration) — NEVER return "mismatch" or "uncertain" solely because source duration is missing or because the IMDb runtime is long (150-240+ min is normal for Bollywood, epic, and classic films).',
    'Ignore release/rip/encoding tags in source titles (e.g., DvDRiP, Dv DRi P, x264, X 264, AAC, Chapters, [Dr C], VOSE, Turkish Movie, Full Movie).',
    'If the source is a trailer, clip, TV episode, or clearly a different movie with a similar title, return "mismatch".',
    '',
    'SOURCE VIDEO:',
    formatSourceSummary(source),
    '',
    'IMDB CANDIDATE:',
    formatCandidateSummary(candidate),
    '',
    'Respond ONLY with valid JSON: {"verdict": "match" | "mismatch" | "uncertain", "confidence": 0.0..1.0, "reason": "concise 1-sentence explanation"}',
  ].join('\n')

  try {
    const rawContent = await sendPromptWithRetry(apiKey, model, prompt)
    if (!rawContent) {
      return { verdict: 'uncertain', confidence: 0, reason: 'Empty response from LLM' }
    }

    const parsed = extractJsonObject(rawContent)
    if (!parsed) {
      return { verdict: 'uncertain', confidence: 0, reason: 'Failed to parse JSON response' }
    }

    return {
      verdict: normalizeVerdict(parsed.verdict),
      confidence: normalizeConfidence(parsed.confidence),
      reason:
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'No reason provided',
      provider: 'openrouter',
      model,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      verdict: 'uncertain',
      confidence: 0,
      reason: `Verification error: ${message}`,
    }
  }
}

/**
 * Adjudicate among multiple IMDb candidates and pick the best match (or null).
 */
export async function adjudicateCandidates(
  source: VerifierSourceInput,
  candidates: VerifierCandidateInput[],
  opts?: VerifierOptions
): Promise<AdjudicateCandidatesResult> {
  if (candidates.length === 0) {
    return {
      chosenImdbId: null,
      verdict: 'mismatch',
      confidence: 1,
      reason: 'No candidates provided',
    }
  }

  if (!opts?.model && isJevAvailable() && candidates.length > 0) {
    const idMap: Record<string, string> = {}
    const criteria: Record<string, string> = {}

    candidates.forEach((c, idx) => {
      const key = `cand_${idx}`
      idMap[key] = c.imdbId
      const topCast = c.actors
        ? c.actors
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(', ')
        : ''
      const parts = [
        `${c.imdbId}: "${c.title}"`,
        c.year ? `(${c.year})` : '',
        c.runtimeMin ? `${c.runtimeMin}min` : '',
        c.type ? `[${c.type}]` : '',
        c.director ? `dir: ${c.director}` : '',
        topCast ? `cast: ${topCast}` : '',
        c.plot ? `plot: ${c.plot.slice(0, 140)}` : '',
      ].filter(Boolean)
      criteria[key] = parts.join(' ')
    })

    criteria.none_match = 'None of the listed IMDb candidates match this film.'
    criteria.not_a_movie =
      'The source is NOT a movie/film (e.g. TV series episode, newsreel, lecture, interview, audiobook, or non-film upload).'

    try {
      const res = await classifyWithJev(
        {
          source: {
            rawTitle: source.title,
            sourceId: source.sourceId || undefined,
            originalTitle: source.originalTitle || undefined,
            altTitles: source.altTitles?.length ? source.altTitles : undefined,
            year: source.year ?? undefined,
            durationMin: source.durationMin ?? undefined,
            director: source.director || undefined,
            cast: source.cast?.length ? source.cast : undefined,
            channelName: source.channelName || undefined,
            description: source.description ? source.description.slice(0, 700) : undefined,
          },
        },
        {
          bestMatch: {
            type: 'choice',
            instructions:
              'Pick which IMDb candidate (if any) is the SAME film as the uploaded video source. Account for localized/translated titles and ignore YouTube clickbait hooks before "|" or promo/rip tags. When source has no year, require corroborating plot/cast/director/distinctive title evidence. Choose none_match if none fit, or not_a_movie if the source is a TV episode, newsreel, or non-film.',
            criteria,
          },
        }
      )

      const ans = res.answers.bestMatch as JevChoiceAnswer | undefined
      if (ans && ans.choice) {
        const choice = ans.choice
        const prob = Math.max(0, Math.min(1, ans.probabilities?.[choice] ?? ans.confidence ?? 0))

        if (choice === 'not_a_movie' && prob >= 0.85) {
          return {
            chosenImdbId: null,
            verdict: 'mismatch',
            confidence: 0,
            reason: `Jev: not a movie (${Math.round(prob * 100)}%)`,
            isNotAMovie: true,
            provider: 'jev',
            model: res.model,
          }
        }

        if (choice === 'none_match' && prob >= 0.8) {
          return {
            chosenImdbId: null,
            verdict: 'mismatch',
            confidence: 0,
            reason: `Jev: no candidate matches (${Math.round(prob * 100)}%)`,
            provider: 'jev',
            model: res.model,
          }
        }

        const matchedId = idMap[choice]
        if (matchedId && prob >= 0.85) {
          return {
            chosenImdbId: matchedId,
            verdict: 'match',
            confidence: Number(prob.toFixed(2)),
            reason: `Jev match (${Math.round(prob * 100)}%)`,
            provider: 'jev',
            model: res.model,
          }
        }

        if (!isOpenRouterAvailable(opts)) {
          return {
            chosenImdbId: matchedId || null,
            verdict: 'uncertain',
            confidence: Number(prob.toFixed(2)),
            reason: `Jev uncertain (${choice}, ${Math.round(prob * 100)}%)`,
            provider: 'jev',
            model: res.model,
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`[MatchVerifier] Jev adjudicateCandidates fallback to OpenRouter: ${msg}`)
    }
  }

  const apiKey = getApiKey(opts)
  if (!apiKey) {
    return {
      chosenImdbId: null,
      verdict: 'uncertain',
      confidence: 0,
      reason: 'OPENROUTER_API_KEY not configured',
    }
  }

  const model = opts?.model || DEFAULT_MODEL
  const candidateBlocks = candidates
    .map((c, idx) => `--- Candidate ${idx + 1} ---\n${formatCandidateSummary(c)}`)
    .join('\n\n')

  const prompt = [
    'You are a film metadata verification expert. Pick which IMDb candidate (if any) is the SAME film as the uploaded video source.',
    'Check title (including translations/AKAs), release year, runtime, director/cast, and plot.',
    'Missing source duration/runtime is normal — NEVER reject a candidate solely because source duration is missing or because the IMDb runtime is long (150-240+ min is normal for Bollywood, epic, and classic films).',
    'Ignore release/rip/encoding tags in source titles (e.g., DvDRiP, Dv DRi P, x264, X 264, AAC, Chapters, VOSE, Full Movie).',
    'CRITICAL ANTI-FALSE-POSITIVE RULES:',
    '1. YouTube channels (especially Movie Central) often put a clickbait hook before the first "|" and the actual film title in another segment (e.g., "Man Wakes Up After Fatal Crash | Suburbanite | Full Thriller Movie" -> the film is "Suburbanite"). NEVER match a candidate solely because a word in the clickbait hook overlaps with the candidate title — the actual film title, plot, cast, or director must match.',
    '2. When the source has NO release year, require corroborating plot, cast, director, or distinctive title evidence; if the title is generic and plot/cast do not clearly align, return "mismatch" or "uncertain" instead of guessing.',
    '3. If the source is a TV episode (e.g., Bonanza, Petticoat Junction), newsreel, lecture, interview, or clearly not a match to ANY candidate, set chosenImdbId to null and verdict to "mismatch".',
    '',
    'SOURCE VIDEO:',
    formatSourceSummary(source, 900),
    '',
    'CANDIDATES:',
    candidateBlocks,
    '',
    'Respond ONLY with valid JSON: {"chosenImdbId": "tt..." | null, "verdict": "match" | "mismatch" | "uncertain", "confidence": 0.0..1.0, "reason": "concise 1-sentence explanation"}',
  ].join('\n')

  try {
    const rawContent = await sendPromptWithRetry(apiKey, model, prompt)
    if (!rawContent) {
      return {
        chosenImdbId: null,
        verdict: 'uncertain',
        confidence: 0,
        reason: 'Empty response from LLM',
      }
    }

    const parsed = extractJsonObject(rawContent)
    if (!parsed) {
      return {
        chosenImdbId: null,
        verdict: 'uncertain',
        confidence: 0,
        reason: 'Failed to parse JSON response',
      }
    }

    const validIds = new Set(candidates.map(c => c.imdbId))
    const rawId = typeof parsed.chosenImdbId === 'string' ? parsed.chosenImdbId.trim() : null
    const chosenImdbId = rawId && validIds.has(rawId) ? rawId : null
    const verdict = normalizeVerdict(parsed.verdict)

    return {
      chosenImdbId: verdict === 'mismatch' ? null : chosenImdbId,
      verdict,
      confidence: normalizeConfidence(parsed.confidence),
      reason:
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'No reason provided',
      provider: 'openrouter',
      model,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      chosenImdbId: null,
      verdict: 'uncertain',
      confidence: 0,
      reason: `Adjudication error: ${message}`,
    }
  }
}

function normalizeStringArray(val: unknown, maxLen = 6): string[] {
  if (!Array.isArray(val)) return []
  return Array.from(
    new Set(
      val
        .filter((v): v is string => typeof v === 'string')
        .map(v => v.trim())
        .filter(v => v.length >= 2 && v.length <= 120)
    )
  ).slice(0, maxLen)
}

function normalizeOptionalString(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  return trimmed.length >= 2 && trimmed.toLowerCase() !== 'null' && trimmed.toLowerCase() !== 'n/a'
    ? trimmed
    : null
}

function normalizeOptionalYear(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    const y = Math.round(val)
    return y >= 1888 && y <= 2035 ? y : null
  }
  if (typeof val === 'string') {
    const m = val.match(/\b(18\d{2}|19\d{2}|20[0-3]\d)\b/)
    if (m?.[1]) {
      const y = parseInt(m[1], 10)
      return y >= 1888 && y <= 2035 ? y : null
    }
  }
  return null
}

/**
 * Phase 2 LLM Query Planner:
 * Given a noisy/foreign/hard-to-match source video (and optional rejected Pass-1 candidates),
 * determine whether it is a real film and generate targeted title, original/English title,
 * year, director/cast, and web search queries to find the exact IMDb entry.
 */
export async function planMatchQueries(
  source: VerifierSourceInput,
  rejectedCandidates: Array<{ imdbId: string; title: string; year?: number | null }> = [],
  opts?: VerifierOptions
): Promise<QueryPlanResult | null> {
  const apiKey = getApiKey(opts)
  if (!apiKey) return null

  const model = opts?.model || DEFAULT_MODEL
  const rejectedBlock =
    rejectedCandidates.length > 0
      ? `\nALREADY REJECTED (DO NOT REPEAT THESE):\n${rejectedCandidates
          .slice(0, 6)
          .map(c => `- ${c.imdbId}: ${c.title}${c.year ? ` (${c.year})` : ''}`)
          .join('\n')}`
      : ''

  const prompt = [
    'You are a film identification & search-query specialist. Analyze the uploaded video metadata below to identify the exact film and produce targeted search queries for IMDb / TMDB / Wikidata / web search.',
    'Instructions:',
    '1. First decide `isMovie`: set to `false` if this is clearly NOT a film/feature/short movie (e.g. a TV series episode like Bonanza or Petticoat Junction, raw archival newsreel/home footage without an IMDb film title, lecture, interview, audiobook chapter, tax declaration, or gibberish/non-movie upload). Otherwise `true`.',
    '2. Extract the REAL film title (`cleanTitle`), original-language title (`originalTitle`), and English/international IMDb title (`englishTitle`) from the raw title, description, or slug.',
    '   - Strip YouTube clickbait hooks (e.g. "Hook | Real Title | Genre" -> "Real Title"), emojis, channel names, and release tags.',
    '   - If the description mentions the real or original title (e.g. "Blood on the Sun", "Du mou dans la gâchette", "Originaltitel: ..."), use it!',
    '   - If the title is in German/Spanish/French/Turkish/Japanese/etc., provide the known English/IMDb release title in `englishTitle` and original title in `originalTitle`.',
    '3. Extract the TRUE release `year` (ignore YouTube upload/promo years like "2025 Movie" or "Kriegsfilme 2026").',
    '4. Extract `director` and `cast` (up to 4 main actors) if mentioned in the title or description.',
    '5. Provide `searchQueries` (2 to 4 clean movie title strings without years/tags, e.g. English title, original title, alternate title) for title-index search.',
    '6. Provide `webQueries` (1 to 2 concise unquoted web search queries WITHOUT any `site:` prefix, combining title + director/actor/year or distinctive plot keywords, e.g. "Mary Higgins Clark Dr. Highley" or "Laughing Times John Woo 1980") for `site:imdb.com/title` web search.',
    '',
    'SOURCE VIDEO:',
    formatSourceSummary(source, 1200),
    rejectedBlock,
    '',
    'Respond ONLY with valid JSON: {"isMovie": true|false, "cleanTitle": string|null, "originalTitle": string|null, "englishTitle": string|null, "year": number|null, "director": string|null, "cast": string[], "searchQueries": string[], "webQueries": string[], "reason": "1-sentence rationale"}',
  ].join('\n')

  try {
    const rawContent = await sendPromptWithRetry(apiKey, model, prompt)
    if (!rawContent) return null
    const parsed = extractJsonObject(rawContent)
    if (!parsed) return null

    return {
      isMovie: parsed.isMovie !== false,
      cleanTitle: normalizeOptionalString(parsed.cleanTitle),
      originalTitle: normalizeOptionalString(parsed.originalTitle),
      englishTitle: normalizeOptionalString(parsed.englishTitle),
      year: normalizeOptionalYear(parsed.year),
      director: normalizeOptionalString(parsed.director),
      cast: normalizeStringArray(parsed.cast, 5),
      searchQueries: normalizeStringArray(parsed.searchQueries, 4),
      webQueries: normalizeStringArray(parsed.webQueries, 2),
      reason:
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'Query plan generated',
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[MatchVerifier] planMatchQueries failed: ${msg}`)
    return null
  }
}
