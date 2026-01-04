/**
 * Get the full poster path with base URL
 * Handles GitHub Pages deployment where base URL might be '/movies/'
 *
 * @param imdbId - The IMDB ID of the movie
 * @returns Full poster path with base URL
 *
 * @example
 * // On localhost: '/posters/tt1234567.jpg'
 * // On GitHub Pages: '/movies/posters/tt1234567.jpg'
 * getPosterPath('tt1234567')
 */
export function getPosterPath(imdbId: string): string {
  // Get base URL from Nuxt config (e.g., '/movies/' for GitHub Pages)
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'

  // Construct poster path
  const posterPath = `/posters/${imdbId}.jpg`

  // Return full path with base URL
  return baseURL === '/' ? posterPath : `${baseURL}${posterPath.slice(1)}`
}
