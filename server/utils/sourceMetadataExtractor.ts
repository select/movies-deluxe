/**
 * Source Metadata & Title Variant Extractor
 *
 * Extracts structured metadata (clean title, original title, alt titles,
 * release year, director, cast, Archive.org slug title) from raw source
 * titles, descriptions, and sourceIds.
 */

import { extractYearFromTitle } from './matchScorer'
import { cleanTitle, cleanTitleGeneral } from './titleCleaner'

export interface SourceMetadataInput {
  rawTitle: string
  description?: string | null
  sourceId?: string | null
  platform?: string | null
  channelId?: string | null
  channelName?: string | null
}

export interface ExtractedSourceMetadata {
  cleanTitle: string
  originalTitle?: string
  altTitles: string[]
  year?: number
  titleYear?: number
  descYear?: number
  descYearExplicit?: boolean
  director?: string
  cast: string[]
  slugTitle?: string
}

const PROMO_SEGMENT_RE =
  /^(?:full\s*(?:free\s*)?movie|free\s*(?:full\s*)?movie|hd|4k|part\s*\d+(?:\s*of\s*\d+)?|subt[ií]tulos.*|english\s*subtitles?|vose|ganzer\s*film.*|unzensiert.*|movie\s*central|filmrise(?:\s*movies)?|netzkino|moviedome|popcornflix|mosfilm|pizzaflix|\d{4}\s+.*movie|(?:action|drama|comedy|horror|thriller|romance|romantic|sci-fi|science\s*fiction|western|mystery|adventure|crime|war|family|documentary|epic|classic|military|party|holiday|christmas|comedia)(?:[\s,/&]+(?:action|drama|comedy|horror|thriller|romance|romantic|sci-fi|science\s*fiction|western|mystery|adventure|crime|war|family|documentary|epic|classic|military|party|holiday|christmas|movie|film))*)$/i

const TRAILING_NOISE_RE =
  /\s*(?:,?\s*(?:turkish|full|free)\s*movie|\b(?:hd|4k|dvdrip|brrip|bdrip|webrip|hdrip|x264|h264|xvid|vose)\b|\*+\s*hd\s*\*+)\s*/gi

const TRAILING_CAST_RE =
  /\s+(?:with|starring|featuring|mit)\s+[A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,3}.*$/u

const PROMO_LINE_RE =
  /(?:©|copyright|subscribe|abonnieren|facebook|youtube|bit\.ly|playlists|new\s+.*\s+movies|films?\s+from)/i

const PIPE_NON_PERSON_RE =
  /\b(?:movie|movies|film|films|full|free|hd|4k|english|german|deutsch|spanish|french|subtitles?|subtitulos|vose|classic|action|drama|comedy|horror|thriller|romance|romantic|sci-fi|fantasy|western|mystery|adventure|crime|war|family|documentary|epic|christmas|holiday|survival|disaster|monster|shark|vampire|zombie|central|cinema|classics|filmrise|netzkino|moviedome|popcornflix|mosfilm|pizzaflix|part|episode|season|chapter|trailer|teaser)\b/i

function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, ' ')
}

function stripParentheticalAndYearNoise(text: string): string {
  let out = stripEmojis(text)
    .replace(
      /\([^)]*(?:18\d{2}|19\d{2}|20[0-3]\d|full\s*movie|ganzer\s*film|krimi|drama|thriller|horror|comedy|scifi|sci-fi|action|doku|unzensiert|netzkino|moviedome|awarded|deutsch|german|film\s*noir|subtitles?|vose)[^)]*\)/gi,
      ' '
    )
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\s*(?:18\d{2}|19\d{2}|20[0-3]\d)\s*(?:film)?\s*\)/gi, ' ')
    .replace(TRAILING_NOISE_RE, ' ')
    .replace(/,\s*(?:starring|with|featuring)\s+.+$/i, '')
    .replace(TRAILING_CAST_RE, '')

  // Strip trailing standalone year if there is a non-year title before it
  const trailingYearMatch = out.match(/^(.+?)\s+(18\d{2}|19\d{2}|20[0-3]\d)\s*$/)
  if (trailingYearMatch?.[1] && trailingYearMatch[1].trim().length >= 2) {
    out = trailingYearMatch[1]
  }

  return out
    .replace(/[,|]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDescriptionYear(description?: string | null): {
  year?: number
  isExplicit: boolean
} {
  if (!description) return { isExplicit: false }
  const lines = description
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 10)

  let parenYear: number | undefined

  for (const line of lines) {
    if (PROMO_LINE_RE.test(line)) continue

    const explicitMatch = line.match(
      /^(?:Year|Release(?:\s+Date)?|Released|Erscheinungsjahr|Jahr)\s*[:-]\s*.*?\b(18\d{2}|19\d{2}|20[0-3]\d)\b/i
    )
    if (explicitMatch?.[1]) {
      const y = parseInt(explicitMatch[1], 10)
      if (y >= 1888 && y <= 2035) return { year: y, isExplicit: true }
    }

    // Leading year on a line, e.g. "2010.  Stars: Estella Warren, Rhett Giles" or "2010 | ..."
    const leadingMatch = line.match(/^(18\d{2}|19\d{2}|20[0-3]\d)\s*[.|\-–•,]/)
    if (leadingMatch?.[1]) {
      const y = parseInt(leadingMatch[1], 10)
      if (y >= 1888 && y <= 2035) return { year: y, isExplicit: true }
    }

    if (!parenYear) {
      const parenMatch = line.match(/\((\d{4})\)/)
      if (parenMatch?.[1]) {
        const y = parseInt(parenMatch[1], 10)
        if (y >= 1888 && y <= 2035) parenYear = y
      }
    }
  }

  return parenYear ? { year: parenYear, isExplicit: false } : { isExplicit: false }
}

function extractArchiveSlugInfo(sourceId?: string | null): {
  slugTitle?: string
  slugYear?: number
} {
  if (!sourceId) return {}

  // Strip trailing upload date stamps like _202501, _20250115, -202501
  let slug = sourceId.replace(/[_-]202\d{3,5}$/, '')

  // Extract plausible release year from slug (excluding 6-8 digit date stamps)
  let slugYear: number | undefined
  const yearMatch = slug.match(/(?:^|[-_])(18\d{2}|19\d{2}|20[0-3]\d)(?:[-_]|$)/)
  if (yearMatch?.[1]) {
    const parsed = parseInt(yearMatch[1], 10)
    if (parsed >= 1888 && parsed <= 2035) {
      slugYear = parsed
    }
  }

  // Clean slug into a readable title
  slug = slug
    .replace(/(?:^|[-_])(18\d{2}|19\d{2}|20[0-3]\d)(?:[-_]|$)/g, ' ')
    .replace(/[-_](?:hd|720p|1080p|480p|dvdrip|brrip|bdrip|webrip|full[-_]?movie)$/gi, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const slugTitle = slug.length >= 2 && !/^\d+$/.test(slug) ? slug : undefined
  return { slugTitle, slugYear }
}

function extractOriginalTitle(description?: string | null): string | undefined {
  if (!description) return undefined
  const match = description.match(
    /(?:^|\r?\n)\s*(?:Originaltitel|Original\s*Title|OT)\s*:\s*([^\r\n]+)/i
  )
  if (!match?.[1]) return undefined
  const cleaned = match[1]
    .trim()
    .replace(/^["'«»„"]+|["'«»„"]+$/g, '')
    .trim()
  return cleaned.length >= 2 ? cleaned : undefined
}

function extractDirector(description?: string | null): string | undefined {
  if (!description) return undefined
  const lineMatch = description.match(
    /(?:^|\r?\n|[.\-|•]\s*)(?:Director|Directed\s+by|Regie|Dir\.?)\s*:\s*([^\r\n]+)/i
  )
  if (lineMatch?.[1]) {
    const cleaned = lineMatch[1]
      .replace(/\([^)]*\)/g, '')
      .replace(/[.;]+$/, '')
      .trim()
    if (cleaned.length >= 3) return cleaned
  }

  const inlineMatch = description.match(
    /\b(?:Directed\s+by|dir\.?)\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){1,3})/u
  )
  if (inlineMatch?.[1]) {
    return inlineMatch[1].trim()
  }

  return undefined
}

function extractCast(rawTitle: string, description?: string | null): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  const addName = (raw: string) => {
    const cleaned = raw
      .replace(/\([^)]*\)/g, '')
      .replace(/[^\p{L}\p{N}.'\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned.length < 3 || cleaned.length > 50) return
    const key = cleaned.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      names.push(cleaned)
    }
  }

  if (description) {
    const castMatch = description.match(
      /(?:^|\r?\n|[.\-|•]\s*)(?:Stars|Starring|Mit|Cast|Actors|Darsteller)\s*:\s*([^\r\n]+)/i
    )
    if (castMatch?.[1]) {
      for (const part of castMatch[1].split(/[,/;&]+/)) {
        addName(part)
        if (names.length >= 6) break
      }
    }
  }

  const titleCastMatch = rawTitle.match(
    /\b(?:with|starring|featuring|mit)\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){1,3})/u
  )
  if (titleCastMatch?.[1]) {
    addName(titleCastMatch[1])
  }

  // Extract trailing pipe-separated person names like "| Estella Warren | Rhett Giles"
  if (rawTitle.includes('|') && names.length < 6) {
    const segments = rawTitle.split('|').slice(1)
    for (const seg of segments) {
      const trimmed = stripEmojis(seg).trim()
      if (
        trimmed.length >= 5 &&
        trimmed.length <= 35 &&
        !PROMO_SEGMENT_RE.test(trimmed) &&
        !PIPE_NON_PERSON_RE.test(trimmed) &&
        /^[A-Z][\p{L}'-]+(?:\s+[A-Z]\.?)?\s+[A-Z][\p{L}'-]+$/u.test(trimmed)
      ) {
        addName(trimmed)
        if (names.length >= 6) break
      }
    }
  }

  return names.slice(0, 6)
}

export function extractSourceMetadata(input: SourceMetadataInput): ExtractedSourceMetadata {
  const rawTitle = (input.rawTitle || '').trim()
  const platform = input.platform?.toLowerCase() || ''

  const originalTitle = extractOriginalTitle(input.description)
  const director = extractDirector(input.description)
  const cast = extractCast(rawTitle, input.description)

  const descYearInfo = extractDescriptionYear(input.description)
  // Strip promo-tag years (e.g. "2026 Rom Com Movie", "HD 2025 Movie", "Kriegsfilme 2026", "family films 2023 new")
  const titleWithoutPromoYears = rawTitle
    .replace(
      /\b202\d\s+(?:rom\s*com|party|action|horror|thriller|drama|comedy|holiday|christmas|new|free|full|hd|movie|film|movies|films)\b/gi,
      ' '
    )
    .replace(
      /\b(?:new\s+horror\s+movies|family\s+films|films\s+from\s+germany|action\s+thriller|kriegsfilme|filme|hd)\s+202\d\b/gi,
      ' '
    )
  const titleYear = extractYearFromTitle(titleWithoutPromoYears) ?? undefined
  const archiveInfo = platform === 'archive.org' ? extractArchiveSlugInfo(input.sourceId) : {}

  // Explicit description year (e.g. "Year: 2010" or "2010. Stars:") beats incidental title noise,
  // while an explicit titleYear (e.g. "Tarzan's Revenge (1938)") beats incidental parenthetical years in descriptions.
  const year = descYearInfo.isExplicit
    ? (titleYear ?? descYearInfo.year ?? archiveInfo.slugYear)
    : (titleYear ?? descYearInfo.year ?? archiveInfo.slugYear)

  // Build channel-cleaned and general-cleaned titles
  const channelCleaned =
    platform === 'youtube' && (input.channelId || input.channelName)
      ? cleanTitle(rawTitle, input.channelId || '', input.channelName)
      : rawTitle
  const channelStripped = stripParentheticalAndYearNoise(channelCleaned)
  const generalCleaned = stripParentheticalAndYearNoise(cleanTitleGeneral(rawTitle))

  const primaryTitle =
    channelStripped.length >= 2
      ? channelStripped
      : generalCleaned.length >= 2
        ? generalCleaned
        : rawTitle

  const altSet = new Map<string, string>()
  const addAlt = (candidate?: string | null) => {
    if (!candidate) return
    const trimmed = candidate.trim()
    if (trimmed.length < 2) return
    const key = trimmed.toLowerCase()
    if (key === primaryTitle.toLowerCase()) return
    if (originalTitle && key === originalTitle.toLowerCase()) return
    if (!altSet.has(key)) {
      altSet.set(key, trimmed)
    }
  }

  addAlt(generalCleaned)
  if (channelCleaned !== channelStripped) {
    addAlt(stripEmojis(channelCleaned).trim())
  }

  // Split pipe-separated segments (e.g. "Hook | Real Title | Genre")
  if (rawTitle.includes('|')) {
    for (const seg of rawTitle.split('|')) {
      const cleanedSeg = stripParentheticalAndYearNoise(seg)
      if (cleanedSeg.length >= 2 && !PROMO_SEGMENT_RE.test(cleanedSeg)) {
        addAlt(cleanedSeg)
      }
    }
  }

  // Strip possessive prefix (e.g. "Jack London's THE FIGHTER" -> "THE FIGHTER")
  const possessiveMatch = primaryTitle.match(/^[^:]+['’]s\s+(.+)$/)
  if (possessiveMatch?.[1] && possessiveMatch[1].trim().length >= 3) {
    addAlt(possessiveMatch[1].trim())
  }

  if (archiveInfo.slugTitle) {
    addAlt(archiveInfo.slugTitle)
  }

  return {
    cleanTitle: primaryTitle,
    originalTitle,
    altTitles: Array.from(altSet.values()),
    year,
    titleYear,
    descYear: descYearInfo.year,
    descYearExplicit: descYearInfo.isExplicit,
    director,
    cast,
    slugTitle: archiveInfo.slugTitle,
  }
}
