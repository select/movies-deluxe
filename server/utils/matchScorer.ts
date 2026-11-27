/**
 * Pure deterministic candidate scorer & guardrail module for movie matching.
 */

export type ContentType = 'movie' | 'double_feature' | 'part' | 'tv_episode' | 'clip'
export type MatchTier = 'auto_accept' | 'needs_review' | 'reject'

export interface ScorerSourceInput {
  title: string
  originalTitle?: string | null
  altTitles?: string[] | null
  sourceYear?: number | null
  titleYear?: number | null
  sourceDurationMin?: number | null
  director?: string | null
  cast?: string[] | null
  contentType?: ContentType | string | null
}

export interface ScorerCandidateInput {
  imdbId?: string | null
  title: string
  originalTitle?: string | null
  altTitles?: string[] | null
  year?: number | null
  runtimeMin?: number | null
  director?: string | null
  cast?: string[] | string | null
  type?: string | null
}

export interface MatchScoreBreakdown {
  titleScore: number
  yearScore: number
  runtimeScore: number
  peopleScore: number
  contentTypePenalty: number
  bestTitleSimilarity: number
  hasSupportingEvidence: boolean
}

export interface MatchScoreResult {
  score: number
  tier: MatchTier
  flags: string[]
  breakdown: MatchScoreBreakdown
}

const LEADING_ARTICLES = new Set([
  'the',
  'a',
  'an',
  'der',
  'die',
  'das',
  'ein',
  'eine',
  'le',
  'la',
  'les',
  'un',
  'une',
  'el',
  'los',
  'las',
  'il',
  'lo',
])

const HARD_REJECT_FLAGS = new Set([
  'runtime_feature_short_mismatch',
  'runtime_major_mismatch',
  'year_major_mismatch',
  'non_movie_candidate',
  'source_content_clip',
  'source_content_tv_episode',
])

/**
 * Normalize a title for matching:
 * - split CamelCase (e.g. DevilMonster -> Devil Monster)
 * - strip diacritics
 * - lowercase
 * - strip punctuation and collapse whitespace
 */
export function normalizeTitleForMatching(raw: string): string {
  if (!raw) return ''
  const splitCamel = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  return splitCamel
    .replace(/\u0131/g, 'i')
    .replace(/\u0130/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripLeadingArticle(normalized: string): string {
  const parts = normalized.split(' ')
  if (parts.length > 1 && parts[0] && LEADING_ARTICLES.has(parts[0])) {
    return parts.slice(1).join(' ')
  }
  return normalized
}

function tokenize(normalized: string): string[] {
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean)
}

function jaccardAndDice(aTokens: string[], bTokens: string[]): { jaccard: number; dice: number } {
  if (aTokens.length === 0 || bTokens.length === 0) {
    return { jaccard: 0, dice: 0 }
  }
  const aSet = new Set(aTokens)
  const bSet = new Set(bTokens)
  let intersection = 0
  for (const t of aSet) {
    if (bSet.has(t)) intersection++
  }
  const union = aSet.size + bSet.size - intersection
  const jaccard = union > 0 ? intersection / union : 0
  const dice = (2 * intersection) / (aSet.size + bSet.size)
  return { jaccard, dice }
}

/**
 * Compute similarity between two title strings in [0, 1].
 */
export function computeTitleSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizeTitleForMatching(aRaw)
  const b = normalizeTitleForMatching(bRaw)
  if (!a || !b) return 0
  if (a === b) return 1

  const aNoArt = stripLeadingArticle(a)
  const bNoArt = stripLeadingArticle(b)
  if (aNoArt && bNoArt && aNoArt === bNoArt) return 0.96

  const aTokens = tokenize(aNoArt)
  const bTokens = tokenize(bNoArt)
  const { jaccard, dice } = jaccardAndDice(aTokens, bTokens)

  // Weighted blend of Jaccard and Dice
  let sim = 0.45 * jaccard + 0.55 * dice

  // Guard against single generic token overlap (e.g. "Night" vs "Night of the Living Dead")
  const minTokens = Math.min(aTokens.length, bTokens.length)
  const maxTokens = Math.max(aTokens.length, bTokens.length)
  if (minTokens === 1 && maxTokens >= 3 && sim < 0.85) {
    sim = Math.min(sim, 0.45)
  }

  return Math.max(0, Math.min(1, sim))
}

/**
 * Parse OMDb Runtime string (e.g. "94 min") or number into integer minutes.
 */
export function parseRuntimeMinutes(runtime?: string | number | null): number | null {
  if (runtime === null || runtime === undefined) return null
  if (typeof runtime === 'number') {
    return Number.isFinite(runtime) && runtime > 0 ? Math.round(runtime) : null
  }
  const match = String(runtime).match(/(\d+)\s*min/i) || String(runtime).match(/^(\d+)$/)
  if (!match || !match[1]) return null
  const val = parseInt(match[1], 10)
  return Number.isFinite(val) && val > 0 ? val : null
}

/**
 * Extract plausible release year (1888..2035) from a title string.
 */
export function extractYearFromTitle(title?: string | null): number | null {
  if (!title) return null
  const parenMatch = title.match(/\((\d{4})\)/)
  if (parenMatch && parenMatch[1]) {
    const y = parseInt(parenMatch[1], 10)
    if (y >= 1888 && y <= 2035) return y
  }
  const matches = title.match(/\b(18\d{2}|19\d{2}|20[0-3]\d)\b/g)
  if (!matches || matches.length === 0) return null
  const years = matches.map(m => parseInt(m, 10)).filter(y => y >= 1888 && y <= 2035)
  if (years.length === 0) return null
  return Math.min(...years)
}

function normalizePersonToken(token: string): string {
  return token
    .replace(/shch/g, 'sch')
    .replace(/iy$/g, 'y')
    .replace(/y/g, 'i')
    .replace(/ks/g, 'x')
    .replace(/ph/g, 'f')
    .replace(/v/g, 'w')
    .replace(/e/g, 'e')
}

function parsePeopleList(input?: string[] | string | null): string[] {
  if (!input) return []
  const items = Array.isArray(input) ? input : input.split(',')
  return items
    .map(s =>
      s
        .replace(/\s+as\s+.+$/i, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(s => s.length >= 3 && s !== 'n a' && s !== 'na')
}

function peopleOverlapCount(aList: string[], bList: string[]): number {
  if (aList.length === 0 || bList.length === 0) return 0
  let matches = 0
  const bTokenSets = bList.map(name =>
    name
      .split(' ')
      .filter(t => t.length >= 2)
      .map(normalizePersonToken)
  )
  const bAllLongTokens = new Set(bTokenSets.flat().filter(t => t.length >= 4))
  const bFullSet = new Set(bList)

  for (const person of aList) {
    if (bFullSet.has(person)) {
      matches++
      continue
    }
    const aTokens = person
      .split(' ')
      .filter(t => t.length >= 2)
      .map(normalizePersonToken)
    if (aTokens.length === 0) continue

    // Order-independent full/multi-token match (handles "Shakhnazarov Karen" vs "Karen Shakhnazarov")
    const hasTokenSetMatch = bTokenSets.some(bTokens => {
      if (bTokens.length === 0) return false
      const bSet = new Set(bTokens)
      let overlap = 0
      for (const t of aTokens) {
        if (bSet.has(t)) overlap++
      }
      if (overlap >= 2) return true
      // Single long surname match when either side is a multi-word name
      const aLast = aTokens[aTokens.length - 1] || ''
      const aFirst = aTokens[0] || ''
      return (
        (aLast.length >= 4 && bSet.has(aLast)) ||
        (aTokens.length >= 2 && aFirst.length >= 5 && bSet.has(aFirst))
      )
    })

    if (hasTokenSetMatch) {
      matches++
      continue
    }

    const last = aTokens[aTokens.length - 1] || ''
    if (last.length >= 4 && bAllLongTokens.has(last)) {
      matches++
    }
  }
  return matches
}

const RELEASE_NOISE_RE =
  /\b(dvdrip|dv\s*dri\s*p|brrip|bdrip|webrip|hdrip|hdtv|x264|x\s*264|h264|h\s*264|xvid|divx|aac|ac3|mp3|chapters|vose|subtitulado|english\s+subtitles?|full\s+movie|turkish\s+movie|1080p|720p|480p|360p)\b/gi

function stripReleaseNoise(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(RELEASE_NOISE_RE, ' ')
    .replace(/\b(18\d{2}|19\d{2}|20[0-3]\d)\b/g, ' ')
    .replace(/[,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitleVariants(raw?: string | null): string[] {
  if (!raw || !raw.trim()) return []
  const variants = new Set<string>([raw.trim()])
  // Strip parenthetical years/tags and bracketed tags
  const stripped = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped) variants.add(stripped)

  const noiseStripped = stripReleaseNoise(raw)
  if (noiseStripped.length >= 2) variants.add(noiseStripped)

  // Split pipe-separated segments (e.g. "Hook | Real Title | Genre")
  if (raw.includes('|')) {
    for (const part of raw.split('|')) {
      const cleanPart = part
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .trim()
      if (cleanPart.length >= 2) variants.add(cleanPart)
      const cleanNoisePart = stripReleaseNoise(part)
      if (cleanNoisePart.length >= 2) variants.add(cleanNoisePart)
    }
  }
  return Array.from(variants)
}

function collectTitles(
  primary?: string | null,
  original?: string | null,
  alts?: string[] | null
): string[] {
  const out = new Set<string>()
  for (const v of extractTitleVariants(primary)) out.add(v)
  for (const v of extractTitleVariants(original)) out.add(v)
  if (Array.isArray(alts)) {
    for (const alt of alts) {
      for (const v of extractTitleVariants(alt)) out.add(v)
    }
  }
  return Array.from(out)
}

/**
 * Score a candidate match deterministically with guardrails.
 */
export function scoreMatchCandidate(
  source: ScorerSourceInput,
  candidate: ScorerCandidateInput
): MatchScoreResult {
  const flags: string[] = []

  // 1. Title & AKA similarity (0..60 points)
  const sourceTitles = collectTitles(source.title, source.originalTitle, source.altTitles)
  const candidateTitles = collectTitles(
    candidate.title,
    candidate.originalTitle,
    candidate.altTitles
  )

  let bestTitleSimilarity = 0
  for (const sTitle of sourceTitles) {
    for (const cTitle of candidateTitles) {
      const sim = computeTitleSimilarity(sTitle, cTitle)
      if (sim > bestTitleSimilarity) bestTitleSimilarity = sim
    }
  }

  const titleScore = Math.round(bestTitleSimilarity * 60)
  if (bestTitleSimilarity < 0.5) {
    flags.push('title_low_similarity')
  } else if (bestTitleSimilarity < 0.8) {
    flags.push('title_partial_similarity')
  }

  // 2. Year score (-35..+15 points)
  const effectiveSourceYear =
    source.sourceYear ?? source.titleYear ?? extractYearFromTitle(source.title)
  const candidateYear = candidate.year ?? null

  let yearScore = 0
  let yearEvidence = false
  if (effectiveSourceYear && candidateYear) {
    const yearDiff = Math.abs(effectiveSourceYear - candidateYear)
    if (yearDiff === 0) {
      yearScore = 15
      yearEvidence = true
    } else if (yearDiff === 1) {
      yearScore = 8
      yearEvidence = true
    } else if (yearDiff === 2) {
      yearScore = -2
    } else if (yearDiff <= 5) {
      yearScore = -20
      flags.push('year_mismatch')
    } else {
      yearScore = -35
      flags.push('year_major_mismatch')
    }
  }

  // 3. Hard runtime guardrail (-45..+15 points)
  const srcMin = source.sourceDurationMin ?? null
  const candMin = candidate.runtimeMin ?? null
  let runtimeScore = 0
  let runtimeEvidence = false

  if (srcMin && srcMin > 0 && candMin && candMin > 0) {
    const absDiff = Math.abs(srcMin - candMin)
    const relDiff = absDiff / Math.max(srcMin, candMin)

    const isFeatureToShort = srcMin >= 50 && candMin < 30
    const isShortToFeature = srcMin < 25 && candMin >= 60

    if (isFeatureToShort || isShortToFeature) {
      runtimeScore = -45
      flags.push('runtime_feature_short_mismatch')
    } else if (absDiff > 25 && relDiff > 0.35) {
      runtimeScore = -35
      flags.push('runtime_major_mismatch')
    } else if (absDiff > 15 && relDiff > 0.25) {
      runtimeScore = -12
      flags.push('runtime_moderate_mismatch')
    } else if (absDiff <= 10 || relDiff <= 0.15) {
      runtimeScore = 15
      runtimeEvidence = true
    } else {
      runtimeScore = 6
      runtimeEvidence = true
    }
  }

  // 4. People overlap & contradiction (-25..+20 points)
  const srcDirectors = parsePeopleList(source.director)
  const candDirectors = parsePeopleList(candidate.director)
  const srcCast = parsePeopleList(source.cast)
  const candCast = parsePeopleList(candidate.cast)

  const directorOverlap = peopleOverlapCount(srcDirectors, candDirectors)
  const castOverlap = peopleOverlapCount(srcCast, candCast)
  let peopleScore = 0
  if (directorOverlap > 0) peopleScore += 15
  if (castOverlap > 0) peopleScore += 10
  peopleScore = Math.min(20, peopleScore)
  const peopleEvidence = peopleScore > 0

  if (srcDirectors.length > 0 && candDirectors.length > 0 && directorOverlap === 0) {
    flags.push('director_mismatch')
    peopleScore -= 20
  }
  if (srcCast.length >= 2 && candCast.length >= 2 && castOverlap === 0 && directorOverlap === 0) {
    flags.push('cast_mismatch')
    peopleScore -= 20
  }

  // 5. Content type check (-30..0 points)
  let contentTypePenalty = 0
  const candType = candidate.type?.toLowerCase().trim()
  if (candType && candType !== 'movie') {
    if (candType === 'episode' || candType === 'series') {
      contentTypePenalty -= 30
      flags.push('non_movie_candidate')
    } else if (candType === 'short' && srcMin && srcMin >= 50) {
      contentTypePenalty -= 25
      flags.push('short_candidate_for_feature')
    }
  }

  const srcType = source.contentType?.toLowerCase().trim()
  if (
    srcType === 'clip' ||
    srcType === 'tv_episode' ||
    srcType === 'part' ||
    srcType === 'double_feature'
  ) {
    flags.push(`source_content_${srcType}`)
    if (srcType === 'clip' || srcType === 'tv_episode') {
      contentTypePenalty -= 25
    } else {
      contentTypePenalty -= 10
    }
  }

  const rawScore = titleScore + yearScore + runtimeScore + peopleScore + contentTypePenalty
  const score = Math.max(0, Math.min(100, rawScore))
  const hasSupportingEvidence = yearEvidence || runtimeEvidence || peopleEvidence
  const hasHardReject = flags.some(f => HARD_REJECT_FLAGS.has(f))
  const hasPeopleContradiction =
    flags.includes('director_mismatch') || flags.includes('cast_mismatch')

  let tier: MatchTier
  if (hasHardReject || score < 45 || bestTitleSimilarity < 0.45) {
    tier = 'reject'
  } else if (
    score >= 75 &&
    bestTitleSimilarity >= 0.85 &&
    hasSupportingEvidence &&
    !hasPeopleContradiction
  ) {
    tier = 'auto_accept'
  } else {
    tier = 'needs_review'
    if (!hasSupportingEvidence) {
      flags.push('no_supporting_evidence')
    }
  }

  return {
    score,
    tier,
    flags,
    breakdown: {
      titleScore,
      yearScore,
      runtimeScore,
      peopleScore,
      contentTypePenalty,
      bestTitleSimilarity: Number(bestTitleSimilarity.toFixed(3)),
      hasSupportingEvidence,
    },
  }
}

export interface AuditSuspectInput {
  scoreResult: MatchScoreResult
  platform?: string | null
  sourceTitle?: string | null
  sourceDescription?: string | null
  omdbGenre?: string | null
  omdbImdbVotes?: number | null
  verified?: number | boolean | null
}

export interface AuditSuspectResult {
  isSuspect: boolean
  flags: string[]
}

const NON_MOVIE_SOURCE_TITLE_RE =
  /\b(trailer|teaser|featurette|behind the scenes|making of|film and analysis|starring movies)\b/i

const ANIMATION_SOURCE_HINT_RE =
  /\b(animat\w*|cartoon|anime|zeichentrick|trickfilm|disney|pixar|dreamworks|stop[- ]?motion|claymation|cgi)\b/i

/**
 * Evaluate whether an existing IMDb match has deterministic false-hit indicators
 * that warrant Jev / LLM verification (even if title + runtime alone look plausible).
 */
export function evaluateMatchAuditSuspect(input: AuditSuspectInput): AuditSuspectResult {
  const flags = new Set<string>(input.scoreResult.flags)
  const platform = (input.platform || '').toLowerCase()
  const srcTitle = input.sourceTitle || ''
  const srcDesc = input.sourceDescription || ''
  const omdbGenre = input.omdbGenre || ''
  const imdbVotes = input.omdbImdbVotes ?? 0
  const isVerified = Boolean(input.verified)

  if (NON_MOVIE_SOURCE_TITLE_RE.test(srcTitle)) {
    flags.add('non_movie_source_title')
  }

  if (
    platform === 'youtube' &&
    /\bAnimation\b/i.test(omdbGenre) &&
    !ANIMATION_SOURCE_HINT_RE.test(`${srcTitle} ${srcDesc.slice(0, 600)}`)
  ) {
    flags.add('animation_genre_mismatch')
  }

  // High-popularity IMDb titles on free YouTube channels are frequent targets of
  // mockbusters / remakes / shared-title false hits (e.g. Beauty and the Beast 1991,
  // War of the Worlds 2005). Send to Jev unless people overlap already confirms it.
  if (
    !isVerified &&
    platform === 'youtube' &&
    imdbVotes >= 30000 &&
    input.scoreResult.breakdown.peopleScore <= 0
  ) {
    flags.add('high_votes_youtube_unverified')
  }

  const SUSPECT_FLAGS = new Set([
    'runtime_feature_short_mismatch',
    'runtime_major_mismatch',
    'year_major_mismatch',
    'year_mismatch',
    'director_mismatch',
    'cast_mismatch',
    'non_movie_candidate',
    'title_low_similarity',
    'non_movie_source_title',
    'animation_genre_mismatch',
    'high_votes_youtube_unverified',
  ])

  const flagList = Array.from(flags)
  const isSuspect = input.scoreResult.tier === 'reject' || flagList.some(f => SUSPECT_FLAGS.has(f))

  return { isSuspect, flags: flagList }
}
