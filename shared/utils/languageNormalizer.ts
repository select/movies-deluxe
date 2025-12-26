/**
 * Language normalization utilities
 * Converts language names and codes to ISO 639-1 2-letter codes
 * Shared between client and server
 */

// Map common languages to ISO 639-1 codes
const languageMap: Record<string, string> = {
  english: 'en',
  german: 'de',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
  arabic: 'ar',
  hindi: 'hi',
  dutch: 'nl',
  polish: 'pl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  czech: 'cs',
  hungarian: 'hu',
  turkish: 'tr',
  greek: 'el',
  hebrew: 'he',
  thai: 'th',
  vietnamese: 'vi',
}

/**
 * Normalize language to ISO 639-1 2-letter code for database storage
 * @param language - Language name, code, or comma-separated list
 * @returns Lowercase 2-letter ISO 639-1 code or null for invalid/missing values
 */
export function normalizeLanguageCode(language: string | undefined | null): string | null {
  if (!language) return null

  // Extract first language if comma-separated
  const firstLang = language.split(',')[0]?.trim().toLowerCase()
  if (!firstLang) return null

  // Handle special values
  if (firstLang === 'n/a' || firstLang === 'none') return null

  // If already a 2-letter code, return as-is
  if (firstLang.length === 2 && /^[a-z]{2}$/.test(firstLang)) {
    return firstLang
  }

  // Look up full language name
  return languageMap[firstLang] || null
}
