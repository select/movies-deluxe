/**
 * Generate source URLs from identifiers
 * Shared between client and server
 */

export type SourceType = 'archive.org' | 'youtube'

/**
 * Generate URL from source type and identifier
 * @param type - Source type (archive.org or youtube)
 * @param identifier - Unique identifier for the source
 * @returns Full URL to the source
 */
export function generateSourceUrl(type: SourceType, identifier: string): string {
  switch (type) {
    case 'archive.org':
      return `https://archive.org/details/${identifier}`
    case 'youtube':
      return `https://www.youtube.com/watch?v=${identifier}`
    default:
      throw new Error(`Unknown source type: ${type}`)
  }
}
