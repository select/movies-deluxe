let regionDisplayNames: Intl.DisplayNames | null = null

try {
  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    regionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' })
  }
} catch {
  regionDisplayNames = null
}

/**
 * Resolve an ISO 3166-1 alpha-2 region code to its full English country name.
 * Falls back to the uppercase code if resolution fails or Intl.DisplayNames is unavailable.
 */
export function getRegionName(code: string): string {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return ''

  try {
    return regionDisplayNames?.of(normalized) || normalized
  } catch {
    return normalized
  }
}
