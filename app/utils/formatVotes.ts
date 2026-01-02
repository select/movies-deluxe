/**
 * Format IMDB vote count for display
 * @param votes - Vote count as string (e.g., "1234" or "1,234") or number
 * @returns Formatted string (e.g., "1.2K votes" or "995 votes")
 */
export function formatVotes(votes: string | number | undefined): string {
  if (votes === undefined || votes === null || votes === '') return ''

  // Convert to number
  let voteCount: number
  if (typeof votes === 'number') {
    voteCount = votes
  } else {
    // Remove commas and parse to number
    voteCount = parseInt(votes.replace(/,/g, ''), 10)
  }

  if (isNaN(voteCount)) return ''

  // Format based on magnitude
  if (voteCount >= 1_000_000) {
    return `${(voteCount / 1_000_000).toFixed(1)}M votes`
  } else if (voteCount >= 1_000) {
    return `${(voteCount / 1_000).toFixed(1)}K votes`
  } else {
    return `${voteCount} votes`
  }
}
