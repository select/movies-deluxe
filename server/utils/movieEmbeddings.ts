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
  const plot = metadata.Plot || 'No plot description available.'
  const language = metadata.Language || 'Unknown Language'
  const country = metadata.Country || 'Unknown Country'

  const lines = [
    `# ${title} (${year})`,
    '',
    `**Genres:** ${genre}`,
    `**Director:** ${director}`,
    `**Actors:** ${actors}`,
    `**Language:** ${language}`,
    `**Country:** ${country}`,
    '',
    '**Plot:**',
    plot,
  ]

  return lines.join('\n').trim()
}
