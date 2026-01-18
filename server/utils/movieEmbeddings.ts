import type { MovieEntry } from '../../shared/types/movie'

/**
 * Converts a MovieEntry into a structured markdown format for embedding generation.
 * This format is optimized for semantic search by including key metadata in a
 * human-readable structure that LLMs and embedding models can easily process.
 */
export function movieToMarkdown(movie: MovieEntry): string {
  const metadata = movie.metadata || {}
  const ai = movie.ai || {}

  const title = metadata.Title || ai.title || movie.title || 'Unknown Title'
  const year = metadata.Year || ai.year?.toString() || movie.year?.toString() || 'Unknown Year'
  const genre = metadata.Genre || 'Unknown Genre'
  const director = metadata.Director || 'Unknown Director'
  const actors = metadata.Actors || 'Unknown Actors'
  const language = metadata.Language || 'Unknown Language'
  const country = metadata.Country || 'Unknown Country'

  // Use metadata plot, fallback to source description if available
  let plot = metadata.Plot
  if (!plot && movie.sources.length > 0) {
    // Try to find a source with a description
    const sourceWithDescription = movie.sources.find(s => s.description)
    if (sourceWithDescription?.description) {
      plot = sourceWithDescription.description
    }
  }
  if (!plot) {
    plot = 'No plot description available.'
  }

  // Include popularity metrics if available
  const rating = metadata.imdbRating
  const votes = metadata.imdbVotes

  const lines = [
    `# ${title} (${year})`,
    '',
    `**Genres:** ${genre}`,
    `**Director:** ${director}`,
    `**Actors:** ${actors}`,
    `**Language:** ${language}`,
    `**Country:** ${country}`,
  ]

  // Add popularity metrics if available
  if (rating !== undefined) {
    lines.push(`**Rating:** ${rating}/10`)
  }
  if (votes !== undefined) {
    lines.push(`**Votes:** ${votes.toLocaleString()}`)
  }

  lines.push('', '**Plot:**', plot)

  return lines.join('\n').trim()
}
