/**
 * Format IMDB vote count for display
 * @param votes - Vote count as string (e.g., "1234" or "1,234")
 * @returns Formatted string (e.g., "1.2K votes" or "995 votes")
 */
export function formatVotes(votes: string | undefined): string {
  if (!votes) return ''

  // Remove commas and parse to number
  const voteCount = parseInt(votes.replace(/,/g, ''), 10)

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
