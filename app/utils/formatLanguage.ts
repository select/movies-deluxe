/**
 * Convert language name to 2-letter code for display (uppercase)
 * @param language - Language name or comma-separated list (e.g., "English", "German, English")
 * @returns Uppercase 2-letter language code (e.g., "EN", "DE") or empty string
 */
export function getLanguageCode(language: string | undefined): string {
  const normalized = normalizeLanguageCode(language)
  return normalized ? normalized.toUpperCase() : ''
}
