export interface ParsedQuery {
  actors?: string[]
  directors?: string[]
  writers?: string[]
  title?: string
  general?: string
}

/**
 * Parses a search query string into a structured ParsedQuery object.
 * Supports keywords: actor:, director:, writer:, title:
 * Supports quoted strings for values with spaces.
 *
 * Example: 'actor:"Roy Rogers" director:Dave Fleischer Inception'
 * Returns: { actors: ['Roy Rogers'], directors: ['Dave Fleischer'], general: 'Inception' }
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {}
  if (!query) return result

  // Regex matches:
  // 1. (optional keyword):
  // 2. "quoted value" OR non-spaced-value
  const regex = /(?:(actor|director|writer|title):)?(?:"([^"]+)"|([^ ]+))/gi

  let match
  const generalParts: string[] = []

  while ((match = regex.exec(query)) !== null) {
    const keyword = match[1]?.toLowerCase()
    const value = match[2] || match[3]

    if (!value) continue

    if (keyword) {
      if (keyword === 'actor') {
        result.actors = result.actors || []
        result.actors.push(value)
      } else if (keyword === 'director') {
        result.directors = result.directors || []
        result.directors.push(value)
      } else if (keyword === 'writer') {
        result.writers = result.writers || []
        result.writers.push(value)
      } else if (keyword === 'title') {
        result.title = value
      }
    } else {
      generalParts.push(value)
    }
  }

  if (generalParts.length > 0) {
    result.general = generalParts.join(' ')
  }

  return result
}
