/**
 * Free DuckDuckGo HTML Search Fallback for IMDb titles
 *
 * Uses https://html.duckduckgo.com/html/ (no API key, $0) with polite rate limiting.
 */

export interface DuckDuckGoImdbHit {
  imdbId: string
  title: string
  year?: number
  url: string
  snippet?: string
}

const MIN_DELAY_MS = 1500
let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseTitleAndYear(rawTitle: string): { title: string; year?: number } {
  const cleaned = decodeHtmlEntities(rawTitle)
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
 * Search DuckDuckGo for `site:imdb.com/title` matches.
 * Returns deduplicated IMDb hits or [] on rate-limit/network error.
 */
export async function searchDuckDuckGoForImdb(
  title: string,
  year?: number,
  maxResults = 5
): Promise<DuckDuckGoImdbHit[]> {
  const trimmed = title.trim()
  if (!trimmed) return []

  const elapsed = Date.now() - lastRequestAt
  const jitter = Math.floor(Math.random() * 400)
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed + jitter)
  }
  lastRequestAt = Date.now()

  const queryParts = ['site:imdb.com/title', `"${trimmed}"`]
  if (year && year >= 1888 && year <= 2035) {
    queryParts.push(String(year))
  }

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryParts.join(' '))}`
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return []
    }

    const html = await res.text()
    const hits: DuckDuckGoImdbHit[] = []
    const seenIds = new Set<string>()
    const blockRe =
      /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

    let m: RegExpExecArray | null
    while ((m = blockRe.exec(html)) !== null && hits.length < maxResults) {
      const rawHref = m[1] || ''
      const decodedUrl = decodeURIComponent(
        rawHref
          .replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '')
          .replace(/&amp;rut=.*$/, '')
          .replace(/&rut=.*$/, '')
      )

      const ttMatch = decodedUrl.match(/imdb\.com\/title\/(tt\d{7,9})/i)
      if (!ttMatch?.[1]) continue

      const imdbId = ttMatch[1].toLowerCase()
      if (seenIds.has(imdbId)) continue
      seenIds.add(imdbId)

      const rawTitle = (m[2] || '').replace(/<[^>]*>/g, '').trim()
      const snippet = decodeHtmlEntities((m[3] || '').replace(/<[^>]*>/g, '').trim())
      const parsed = parseTitleAndYear(rawTitle)

      hits.push({
        imdbId,
        title: parsed.title,
        year: parsed.year,
        url: decodedUrl,
        snippet: snippet || undefined,
      })
    }

    return hits
  } catch {
    return []
  }
}
