/**
 * Utility to detect if the application is running on localhost
 * Used for developer-only features
 */
export const isLocalhost = () => {
  if (typeof window === 'undefined') return false

  const hostname = window.location.hostname

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local')
  )
}
