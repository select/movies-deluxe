/**
 * Convert language name to 2-letter code
 * @param language - Language name or comma-separated list (e.g., "English", "German, English")
 * @returns 2-letter language code (e.g., "EN", "DE") or empty string
 */
export function getLanguageCode(language: string | undefined): string {
  if (!language) return ''

  // Extract first language if comma-separated
  const firstLang = language.split(',')[0].trim().toLowerCase()

  // Map common languages to codes
  const languageMap: Record<string, string> = {
    english: 'EN',
    german: 'DE',
    french: 'FR',
    spanish: 'ES',
    italian: 'IT',
    portuguese: 'PT',
    russian: 'RU',
    japanese: 'JA',
    chinese: 'ZH',
    korean: 'KO',
    arabic: 'AR',
    hindi: 'HI',
    dutch: 'NL',
    polish: 'PL',
    swedish: 'SV',
    norwegian: 'NO',
    danish: 'DA',
    finnish: 'FI',
    czech: 'CS',
    hungarian: 'HU',
    turkish: 'TR',
    greek: 'EL',
    hebrew: 'HE',
    thai: 'TH',
    vietnamese: 'VI',
  }

  return languageMap[firstLang] || ''
}
