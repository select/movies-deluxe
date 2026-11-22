/**
 * Free Wikipedia MediaWiki API Search for IMDb Film Links
 *
 * Uses https://en.wikipedia.org/w/api.php ($0, no API key) to find film articles
 * and extract linked IMDb tt* IDs from their external links.
 */

export interface WikipediaImdbHit {
  imdbId: string
  title: string
  year?: number
  overview?: string
}

const MIN_DELAY_MS = 300
let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function throttledFetchJson(url: string): Promise<Record<string, unknown> | null> {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed)
  }
  lastRequestAt = Date.now()

  const res = await fetch(url, {
    headers: { 'User-Agent': 'movies-deluxe/1.0 (https://github.com/movies-deluxe)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return null
  return (await res.json()) as Record<string, unknown>
}

function parseWikiTitleAndYear(rawTitle: string): { title: string; year?: number } {
  const yearMatch = rawTitle.match(/\((\d{4})\s*(?:film)?\)/i)
  const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : undefined
  const title = rawTitle
    .replace(/\s*\(\d{4}\s*(?:film)?\)\s*/gi, ' ')
    .replace(/\s*\(film\)\s*/gi, ' ')
    .trim()

  return {
    title: title || rawTitle,
    year: year && year >= 1888 && year <= 2035 ? year : undefined,
  }
}

/**
 * Search English Wikipedia for film articles and extract IMDb tt* IDs.
 */
export async function searchWikipediaForImdb(
  title: string,
  year?: number,
  maxResults = 5
): Promise<WikipediaImdbHit[]> {
  const trimmed = title.trim()
  if (!trimmed) return []

  try {
    const queryParts = [trimmed]
    if (year && year >= 1888 && year <= 2035) {
      queryParts.push(String(year))
    }
    queryParts.push('film')

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryParts.join(' '))}&format=json&srlimit=${maxResults}`
    const searchData = await throttledFetchJson(searchUrl)
    const searchList = ((searchData?.query as Record<string, unknown> | undefined)?.search ||
      []) as Array<{ pageid?: number }>

    const pageIds = searchList.map(s => s.pageid).filter((id): id is number => Boolean(id))
    if (pageIds.length === 0) return []

    const detailsUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageIds.join('|')}&prop=extlinks|extracts&exintro=1&explaintext=1&exchars=350&ellimit=50&format=json`
    const detailsData = await throttledFetchJson(detailsUrl)
    const pages = Object.values(
      ((detailsData?.query as Record<string, unknown> | undefined)?.pages || {}) as Record<
        string,
        {
          title?: string
          extract?: string
          extlinks?: Array<{ '*'?: string }>
        }
      >
    )

    const hits: WikipediaImdbHit[] = []
    const seenIds = new Set<string>()

    for (const page of pages) {
      const extlinks = page.extlinks || []
      for (const link of extlinks) {
        const url = link['*'] || ''
        const match = url.match(/imdb\.com\/title\/(tt\d{7,9})/i)
        if (!match?.[1]) continue

        const imdbId = match[1].toLowerCase()
        if (seenIds.has(imdbId)) continue
        seenIds.add(imdbId)

        const parsed = parseWikiTitleAndYear(page.title || trimmed)
        hits.push({
          imdbId,
          title: parsed.title,
          year: parsed.year,
          overview: page.extract?.trim() || undefined,
        })
      }
    }

    return hits
  } catch {
    return []
  }
}
