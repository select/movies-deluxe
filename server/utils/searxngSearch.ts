/**
 * Self-hosted SearXNG Search Fallback for IMDb titles
 *
 * Uses SEARXNG_URL (e.g. http://localhost:8888) with format=json ($0, unlimited).
 */

export interface SearxngImdbHit {
  imdbId: string
  title: string
  year?: number
  url: string
  snippet?: string
}

const MIN_DELAY_MS = 500
let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isSearxngAvailable(): boolean {
  return Boolean(process.env.SEARXNG_URL?.trim())
}

function parseSearxngTitleAndYear(rawTitle: string): { title: string; year?: number } {
  const cleaned = rawTitle
    .replace(/^(?:Full cast & crew|Plot|Parents Guide|Trivia|Quotes)\s*[-–|:]\s*/i, '')
    .replace(/\s*[-–|]\s*IMDb.*$/i, '')
    .trim()

  const yearMatch = cleaned.match(/\((\d{4})(?:–\d{4})?\)/)
  const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : undefined
  const title = cleaned.replace(/\s*\(\d{4}(?:–\d{4})?\)\s*/g, ' ').trim()

  return {
    title: title || cleaned,
    year: year && year >= 1888 && year <= 2035 ? year : undefined,
  }
}

/**
 * Search local SearXNG instance for `site:imdb.com/title` matches.
 */
export async function searchSearxngForImdb(
  title: string,
  year?: number,
  maxResults = 5
): Promise<SearxngImdbHit[]> {
  const baseUrl = process.env.SEARXNG_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl) return []

  const trimmed = title.trim()
  if (!trimmed) return []

  const elapsed = Date.now() - lastRequestAt
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed)
  }
  lastRequestAt = Date.now()

  const queryParts = ['site:imdb.com/title', `"${trimmed}"`]
  if (year && year >= 1888 && year <= 2035) {
    queryParts.push(String(year))
  }

  try {
    const url = `${baseUrl}/search?q=${encodeURIComponent(queryParts.join(' '))}&format=json`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return []

    const data = (await res.json()) as {
      results?: Array<{ url?: string; title?: string; content?: string }>
    }

    const hits: SearxngImdbHit[] = []
    const seenIds = new Set<string>()

    for (const item of data.results || []) {
      const itemUrl = item.url || ''
      const ttMatch = itemUrl.match(/imdb\.com\/title\/(tt\d{7,9})/i)
      if (!ttMatch?.[1]) continue

      const imdbId = ttMatch[1].toLowerCase()
      if (seenIds.has(imdbId)) continue
      seenIds.add(imdbId)

      const parsed = parseSearxngTitleAndYear(item.title || trimmed)
      hits.push({
        imdbId,
        title: parsed.title,
        year: parsed.year,
        url: itemUrl,
        snippet: item.content?.trim() || undefined,
      })

      if (hits.length >= maxResults) break
    }

    return hits
  } catch {
    return []
  }
}
