/**
 * Normalize title for basic comparison (lowercase, trimmed)
 * Use this for simple case-insensitive comparisons
 */
export function normalizeTitle(title: string): string {
  return (title || '').toLowerCase().trim()
}

/**
 * Normalize title for fuzzy comparison (remove punctuation, lowercase, trim)
 * Use this for deduplication and fuzzy matching where you want to ignore
 * punctuation differences (e.g., "Spider-Man" vs "Spider Man")
 */
export function normalizeTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

/**
 * Clean title for search (remove braces, quotes, stars, etc.)
 */
export function cleanTitleForSearch(title: string): string {
  return title
    .replace(/\(.*?\)/g, '') // Remove (braces)
    .replace(/\[.*?\]/g, '') // Remove [brackets]
    .replace(/["'“”‘’]/g, '') // Remove quotes
    .replace(/[*]/g, '') // Remove stars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}
