/**
 * Wikidata API Integration
 *
 * Queries Wikidata's wbsearchentities + wbgetentities endpoints
 * to resolve movie titles (including non-English titles) to IMDb IDs (P345)
 * and publication years (P577).
 */

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php'
const USER_AGENT = 'MoviesDeluxe/1.0 (https://mdlx.org)'
const MIN_DELAY_MS = 600
const MAX_DELAY_MS = 1000
const MAX_RETRIES = 3

let lastRequestTime = 0
let requestQueue: Promise<void> = Promise.resolve()

export interface WikidataImdbCandidate {
  wikidataId: string
  imdbId: string
  title: string
  altTitles: string[]
  year?: number
  description?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getJitteredDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1))
}

async function wikidataFetch<T>(params: Record<string, string>): Promise<T | null> {
  const url = new URL(WIKIDATA_API_URL)
  url.searchParams.set('format', 'json')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const runRequest = async (): Promise<T | null> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const now = Date.now()
      const elapsed = now - lastRequestTime
      const targetSpacing = getJitteredDelayMs()
      if (elapsed < targetSpacing) {
        await sleep(targetSpacing - elapsed)
      }
      lastRequestTime = Date.now()

      try {
        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(15000),
        })

        if (response.ok) {
          return (await response.json()) as T
        }

        if (response.status === 429 || response.status >= 500) {
          if (attempt === MAX_RETRIES) {
            console.warn(`[Wikidata] Failed after retries: HTTP ${response.status}`)
            return null
          }
          await sleep(1500 * Math.pow(2, attempt))
          continue
        }

        console.warn(`[Wikidata] HTTP ${response.status}`)
        return null
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          console.warn('[Wikidata] Request error:', error)
          return null
        }
        await sleep(1000 * Math.pow(2, attempt))
      }
    }

    return null
  }

  const resultPromise = requestQueue.then(runRequest, runRequest)
  requestQueue = resultPromise.then(
    () => undefined,
    () => undefined
  )
  return resultPromise
}

interface WbSearchResponse {
  search?: Array<{
    id: string
    label?: string
    description?: string
  }>
}

interface WikidataClaim {
  mainsnak?: {
    datavalue?: {
      value?: unknown
    }
  }
}

interface WbGetEntitiesResponse {
  entities?: Record<
    string,
    {
      id: string
      labels?: Record<string, { value: string }>
      aliases?: Record<string, Array<{ value: string }>>
      descriptions?: Record<string, { value: string }>
      claims?: {
        P345?: WikidataClaim[]
        P577?: WikidataClaim[]
      }
    }
  >
}

function extractPublicationYear(claims?: WikidataClaim[]): number | undefined {
  if (!claims || claims.length === 0) return undefined
  let earliestYear: number | undefined

  for (const claim of claims) {
    const val = claim.mainsnak?.datavalue?.value as { time?: string } | undefined
    const timeStr = val?.time
    if (typeof timeStr === 'string') {
      const match = timeStr.match(/^[+-]?(\d{4})/)
      if (match?.[1]) {
        const year = parseInt(match[1], 10)
        if (!Number.isNaN(year) && year >= 1800 && year <= new Date().getFullYear() + 5) {
          if (earliestYear === undefined || year < earliestYear) {
            earliestYear = year
          }
        }
      }
    }
  }

  return earliestYear
}

/**
 * Search Wikidata for films/items matching query and resolve IMDb IDs (P345) + years (P577)
 */
export async function searchWikidataImdb(
  query: string,
  language = 'en',
  limit = 10
): Promise<WikidataImdbCandidate[]> {
  const cleaned = query.trim()
  if (!cleaned) {
    return []
  }

  const lang = language.trim() || 'en'
  const searchData = await wikidataFetch<WbSearchResponse>({
    action: 'wbsearchentities',
    search: cleaned,
    language: lang,
    uselang: lang,
    type: 'item',
    limit: String(Math.min(Math.max(1, limit), 20)),
  })

  const hits = searchData?.search || []
  if (hits.length === 0) {
    return []
  }

  const ids = hits.map(h => h.id).filter(Boolean)
  const languagesParam = lang === 'en' ? 'en' : `${lang}|en`

  const entitiesData = await wikidataFetch<WbGetEntitiesResponse>({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'claims|labels|aliases|descriptions',
    languages: languagesParam,
  })

  const entities = entitiesData?.entities || {}
  const results: WikidataImdbCandidate[] = []

  for (const id of ids) {
    const entity = entities[id]
    if (!entity) continue

    const p345Claims = entity.claims?.P345 || []
    let imdbId: string | null = null
    for (const claim of p345Claims) {
      const val = claim.mainsnak?.datavalue?.value
      if (typeof val === 'string' && /^tt\d{7,9}$/i.test(val)) {
        imdbId = val.toLowerCase()
        break
      }
    }

    if (!imdbId) {
      continue
    }

    const title =
      entity.labels?.en?.value ||
      entity.labels?.[lang]?.value ||
      hits.find(h => h.id === id)?.label ||
      ''

    if (!title) {
      continue
    }

    const aliasSet = new Set<string>()
    for (const langAliases of Object.values(entity.aliases || {})) {
      for (const alias of langAliases) {
        if (alias.value && alias.value !== title) {
          aliasSet.add(alias.value)
        }
      }
    }
    for (const labelObj of Object.values(entity.labels || {})) {
      if (labelObj.value && labelObj.value !== title) {
        aliasSet.add(labelObj.value)
      }
    }

    const year = extractPublicationYear(entity.claims?.P577)
    const description =
      entity.descriptions?.en?.value ||
      entity.descriptions?.[lang]?.value ||
      hits.find(h => h.id === id)?.description

    results.push({
      wikidataId: id,
      imdbId,
      title,
      altTitles: Array.from(aliasSet),
      year,
      description,
    })
  }

  return results
}
