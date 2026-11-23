/**
 * TypeSafe AI Jev (System One) Classifier Client
 *
 * Fast, calibrated first-tier classifier for movie match verification & candidate adjudication.
 */

export interface JevNoulQuestion {
  type: 'noul'
  instructions: string
  criteria: {
    true: string
    false: string
  }
}

export interface JevChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion

export interface JevNoulAnswer {
  type: 'noul'
  noul: number
}

export interface JevChoiceAnswer {
  type: 'choice'
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer

export interface JevClassifyResponse {
  model: string
  answers: Record<string, JevAnswer>
}

export interface JevClassifyOptions {
  model?: string
  timeoutMs?: number
}

const SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'

export function isJevAvailable(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim())
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function sanitizeUnicode(value: string): string {
  // Strip NUL bytes and replace lone UTF-16 surrogates (e.g. from .slice() splitting a surrogate pair)
  return value
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
}

function sanitizeForJson<T>(input: T): T {
  if (typeof input === 'string') {
    return sanitizeUnicode(input) as T
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeForJson) as T
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        out[sanitizeUnicode(k)] = sanitizeForJson(v)
      }
    }
    return out as T
  }
  return input
}

export async function classifyWithJev(
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  options: JevClassifyOptions = {}
): Promise<JevClassifyResponse> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('TYPESAFE_API_KEY is not configured')
  }

  const model = options.model || process.env.JEV_MODEL?.trim() || 'jev-latest'
  const timeoutMs = options.timeoutMs ?? 10000
  const payload = JSON.stringify(sanitizeForJson({ model, state, questions }))

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(SYSTEM_ONE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: controller.signal,
      })

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '')
        const err = new Error(`Jev API HTTP ${response.status}: ${bodyText.slice(0, 200)}`)
        if (attempt === 0 && isRetryableStatus(response.status)) {
          lastError = err
          await new Promise(resolve => setTimeout(resolve, 600))
          continue
        }
        throw err
      }

      const data = (await response.json()) as JevClassifyResponse
      if (!data || typeof data !== 'object' || !data.answers) {
        throw new Error('Invalid Jev API response: missing answers')
      }
      return data
    } catch (error) {
      lastError = error
      const isAbort = error instanceof Error && error.name === 'AbortError'
      const isNetwork = error instanceof TypeError
      if (attempt === 0 && (isAbort || isNetwork)) {
        await new Promise(resolve => setTimeout(resolve, 600))
        continue
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
