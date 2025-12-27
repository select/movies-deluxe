/**
 * Format large numbers with K/M abbreviations
 * @param count - Number to format
 * @returns Formatted string (e.g., "15K", "1.2M")
 */
export function formatCount(count: number): string {
  if (count >= 1000000) {
    const m = count / 1000000
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (count >= 1000) {
    const k = count / 1000
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}K`
  }
  return count.toString()
}

/**
 * Format number with locale-specific separators
 * @param count - Number to format
 * @returns Formatted string (e.g., "15,234")
 */
export function formatCountExact(count: number): string {
  return count.toLocaleString()
}
