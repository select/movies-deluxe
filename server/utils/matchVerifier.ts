import { OpenRouter } from '@openrouter/sdk'
import type { LlmVerdict } from '../../shared/types/match-review'

export interface VerifierSourceInput {
  movieId?: string
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
}

export interface AdjudicateCandidatesResult {
  chosenImdbId: string | null
  verdict: LlmVerdict
  confidence: number
  reason: string
}

const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite'

function getApiKey(opts?: VerifierOptions): string | undefined {
  return opts?.apiKey || process.env.OPENROUTER_API_KEY
}

function createOpenRouterClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: 'https://movies-deluxe.local',
    appTitle: 'Movies Deluxe',
  })
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

function formatSourceSummary(source: VerifierSourceInput): string {
  const lines = [
    `Raw Title: ${source.title}`,
    source.originalTitle ? `Original Title: ${source.originalTitle}` : null,
    source.altTitles?.length ? `Alt Titles: ${source.altTitles.join(', ')}` : null,
    source.year ? `Year: ${source.year}` : null,
    source.durationMin ? `Duration: ${source.durationMin} min` : null,
    source.director ? `Director: ${source.director}` : null,
    source.cast?.length ? `Cast: ${source.cast.join(', ')}` : null,
    source.channelName ? `Channel: ${source.channelName}` : null,
    source.description ? `Description: ${source.description.slice(0, 400)}` : null,
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
    const client = createOpenRouterClient(apiKey)
    const completion = await client.chat.send({
      chatRequest: {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      },
    })

    const rawContent = completion.choices?.[0]?.message?.content
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
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
    'If none of the candidates match, set chosenImdbId to null and verdict to "mismatch".',
    '',
    'SOURCE VIDEO:',
    formatSourceSummary(source),
    '',
    'CANDIDATES:',
    candidateBlocks,
    '',
    'Respond ONLY with valid JSON: {"chosenImdbId": "tt..." | null, "verdict": "match" | "mismatch" | "uncertain", "confidence": 0.0..1.0, "reason": "concise 1-sentence explanation"}',
  ].join('\n')

  try {
    const client = createOpenRouterClient(apiKey)
    const completion = await client.chat.send({
      chatRequest: {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      },
    })

    const rawContent = completion.choices?.[0]?.message?.content
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
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
