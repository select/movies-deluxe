/**
 * IMDb Suggestion API Integration
 *
 * Queries IMDb's public autocomplete endpoint:
 * https://v3.sg.media-imdb.com/suggestion/{firstChar}/{encodedQuery}.json
 *
 * Uses polite rate limiting (600ms-1000ms jittered spacing, concurrency 1,
 * exponential backoff on 429/503).
 */

const MIN_DELAY_MS = 600
const MAX_DELAY_MS = 1000
const MAX_RETRIES = 3

let lastRequestTime = 0
let requestQueue: Promise<void> = Promise.resolve()

export interface ImdbSuggestionCandidate {
  imdbId: string
  title: string
  year?: number
  type?: string
  cast: string[]
  rank?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getJitteredDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1))
}

function getFirstChar(query: string): string {
  const lower = query.trim().toLowerCase()
  const alnumMatch = lower.match(/[a-z0-9]/)
  return alnumMatch?.[0] ?? 'a'
}

interface ImdbSuggestionApiResponse {
  d?: Array<{
    id?: string
    l?: string
    y?: number
    q?: string
    qid?: string
    s?: string
    rank?: number
  }>
}

/**
 * Search IMDb suggestions with concurrency=1 and polite jittered spacing
 */
export async function searchImdbSuggestions(
  query: string,
  limit = 10
): Promise<ImdbSuggestionCandidate[]> {
  const cleaned = query.trim()
  if (!cleaned) {
    return []
  }

  const firstChar = getFirstChar(cleaned)
  const encodedQuery = encodeURIComponent(cleaned.toLowerCase())
  const url = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodedQuery}.json`

  const runRequest = async (): Promise<ImdbSuggestionCandidate[]> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const now = Date.now()
      const elapsed = now - lastRequestTime
      const targetSpacing = getJitteredDelayMs()
      if (elapsed < targetSpacing) {
        await sleep(targetSpacing - elapsed)
      }
      lastRequestTime = Date.now()

      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'MoviesDeluxe/1.0 (+https://mdlx.org)',
          },
          signal: AbortSignal.timeout(15000),
        })

        if (response.ok) {
          const data = (await response.json()) as ImdbSuggestionApiResponse
          const items = data.d || []
          return items
            .filter(item => typeof item.id === 'string' && /^tt\d{7,9}$/i.test(item.id))
            .slice(0, Math.max(1, limit))
            .map(item => ({
              imdbId: item.id!.toLowerCase(),
              title: (item.l || '').trim(),
              year: typeof item.y === 'number' && item.y > 1800 ? item.y : undefined,
              type: item.qid || item.q || undefined,
              cast: item.s
                ? item.s
                    .split(',')
                    .map(name => name.trim())
                    .filter(Boolean)
                : [],
              rank: typeof item.rank === 'number' ? item.rank : undefined,
            }))
            .filter(item => item.title.length > 0)
        }

        if (response.status === 429 || response.status === 503) {
          if (attempt === MAX_RETRIES) {
            console.warn(`[IMDbSuggestion] Failed after retries: HTTP ${response.status}`)
            return []
          }
          const backoffMs = 1500 * Math.pow(2, attempt)
          await sleep(backoffMs)
          continue
        }

        console.warn(`[IMDbSuggestion] HTTP ${response.status} for "${cleaned}"`)
        return []
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[IMDbSuggestion] Request error for "${cleaned}":`, error)
          return []
        }
        await sleep(1000 * Math.pow(2, attempt))
      }
    }

    return []
  }

  const resultPromise = requestQueue.then(runRequest, runRequest)
  requestQueue = resultPromise.then(
    () => undefined,
    () => undefined
  )
  return resultPromise
}
