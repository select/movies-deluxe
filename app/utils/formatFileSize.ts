/**
 * Format file size in bytes to human-readable format
 *
 * @param bytes - File size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.2 GB", "500 MB")
 *
 * @example
 * formatFileSize(1234567890) // "1.15 GB"
 * formatFileSize(500000000) // "476.84 MB"
 * formatFileSize(1024) // "1.00 KB"
 */
export function formatFileSize(bytes: number | undefined, decimals = 2): string {
  if (bytes === undefined || bytes === null) return 'N/A'
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
