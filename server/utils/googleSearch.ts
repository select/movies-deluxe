/**
 * Google Custom Search Engine (CSE) Integration with Free-Tier Quota Guard
 *
 * Persists daily query counts in data/google-cse-quota.json and strictly
 * enforces MAX_DAILY_QUERIES = 100 (free tier, $0).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { useRuntimeConfig } from 'nitropack/runtime'

export const MAX_DAILY_QUERIES = 100

const QUOTA_FILE_PATH = join(process.cwd(), 'data', 'google-cse-quota.json')

interface QuotaFileData {
  date: string
  count: number
}

export interface GoogleQuotaStatus {
  date: string
  used: number
  limit: number
  remaining: number
  exhausted: boolean
}

export interface GoogleImdbSearchItem {
  Title: string
  Year: string
  imdbID: string
  Type: string
  link: string
  Snippet: string
}

export interface GoogleImdbSearchResponse {
  Search: GoogleImdbSearchItem[]
  totalResults: string
  Response: 'True' | 'False'
  Error?: string
}

function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function readQuotaFile(): QuotaFileData {
  const today = getTodayUtcDate()
  if (!existsSync(QUOTA_FILE_PATH)) {
    return { date: today, count: 0 }
  }

  try {
    const raw = readFileSync(QUOTA_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<QuotaFileData>
    if (parsed.date === today && typeof parsed.count === 'number' && parsed.count >= 0) {
      return { date: today, count: Math.floor(parsed.count) }
    }
    return { date: today, count: 0 }
  } catch {
    return { date: today, count: 0 }
  }
}

function writeQuotaFile(data: QuotaFileData): void {
  try {
    mkdirSync(dirname(QUOTA_FILE_PATH), { recursive: true })
    writeFileSync(QUOTA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.warn('[GoogleSearch] Failed to persist quota file:', error)
  }
}

function incrementDailyQuota(): GoogleQuotaStatus {
  const current = readQuotaFile()
  const updated: QuotaFileData = {
    date: current.date,
    count: current.count + 1,
  }
  writeQuotaFile(updated)
  return {
    date: updated.date,
    used: updated.count,
    limit: MAX_DAILY_QUERIES,
    remaining: Math.max(0, MAX_DAILY_QUERIES - updated.count),
    exhausted: updated.count >= MAX_DAILY_QUERIES,
  }
}

function getGoogleCredentials(): { apiKey?: string; cx?: string } {
  try {
    const config = useRuntimeConfig()
    if (config.googleApiKey || config.googleSearchCx) {
      return {
        apiKey: config.googleApiKey || undefined,
        cx: config.googleSearchCx || undefined,
      }
    }
  } catch {
    // Outside Nitro runtime context
  }

  return {
    apiKey: process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY || undefined,
    cx: process.env.GOOGLE_SEARCH_CX || undefined,
  }
}

/**
 * Get current daily Google CSE quota status
 */
export function getGoogleQuotaStatus(): GoogleQuotaStatus {
  const data = readQuotaFile()
  return {
    date: data.date,
    used: data.count,
    limit: MAX_DAILY_QUERIES,
    remaining: Math.max(0, MAX_DAILY_QUERIES - data.count),
    exhausted: data.count >= MAX_DAILY_QUERIES,
  }
}

/**
 * Search Google Custom Search Engine for IMDb movie pages
 */
export async function searchGoogleForImdb(
  query: string,
  opts: { enforceDailyCap?: boolean } = {}
): Promise<GoogleImdbSearchResponse> {
  const enforceDailyCap = opts.enforceDailyCap ?? true
  const trimmed = query.trim()

  if (!trimmed) {
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error: 'Search query is required',
    }
  }

  const { apiKey, cx } = getGoogleCredentials()
  if (!apiKey || !cx) {
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error:
        'Google Search API not configured. Please set GOOGLE_API_KEY and GOOGLE_SEARCH_CX in .env',
    }
  }

  if (enforceDailyCap) {
    const status = getGoogleQuotaStatus()
    if (status.exhausted) {
      return {
        Search: [],
        totalResults: '0',
        Response: 'False',
        Error: `Daily Google CSE free-tier quota reached (${status.used}/${status.limit} for ${status.date})`,
      }
    }
  }

  try {
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
    searchUrl.searchParams.append('key', apiKey)
    searchUrl.searchParams.append('cx', cx)
    searchUrl.searchParams.append('q', trimmed)
    searchUrl.searchParams.append('num', '10')

    // Record query against daily quota before sending request
    incrementDailyQuota()

    const response = await fetch(searchUrl.toString(), {
      signal: AbortSignal.timeout(15000),
    })
    const data = (await response.json()) as {
      error?: { message?: string }
      items?: Array<{
        link: string
        title?: string
        snippet?: string
      }>
    }

    if (data.error) {
      throw new Error(data.error.message || 'Google API Error')
    }

    const items = data.items || []

    const formattedResults: GoogleImdbSearchItem[] = []
    for (const r of items) {
      if (!r.link || !r.link.includes('imdb.com/title/tt')) continue
      const movieIdMatch = r.link.match(/tt\d{7,9}/i)
      const movieId = movieIdMatch ? movieIdMatch[0].toLowerCase() : null
      if (!movieId) continue

      const yearMatch = `${r.title || ''} ${r.snippet || ''}`.match(/\((\d{4})\)/)
      const year = yearMatch?.[1] ?? 'N/A'

      const cleanTitle = r.title
        ? r.title
            .replace(/\s*\((\d{4})\)\s*-\s*IMDb/i, '')
            .replace(/\s*-\s*IMDb/i, '')
            .trim()
        : 'IMDb Result'

      formattedResults.push({
        Title: cleanTitle,
        Year: year,
        imdbID: movieId,
        Type: 'movie',
        link: r.link,
        Snippet: r.snippet || '',
      })
    }

    const uniqueResults = Array.from(
      new Map(formattedResults.map(item => [item.imdbID, item])).values()
    )

    return {
      Search: uniqueResults,
      totalResults: uniqueResults.length.toString(),
      Response: 'True',
    }
  } catch (error: unknown) {
    console.error('Google search error:', error)
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error: error instanceof Error ? error.message : String(error),
    }
  }
}
