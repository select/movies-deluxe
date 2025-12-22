import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { join } from 'node:path'

export async function downloadPoster(
  url: string,
  imdbId: string,
  force: boolean = false
): Promise<boolean> {
  if (!url || url === 'N/A' || !imdbId) return false

  const postersDir = join(process.cwd(), 'public/posters')
  if (!fs.existsSync(postersDir)) {
    fs.mkdirSync(postersDir, { recursive: true })
  }

  const filepath = join(postersDir, `${imdbId}.jpg`)

  // Skip if already exists
  if (!force && fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
    return true
  }

  try {
    await downloadImageOnce(url, filepath, 30000)
    return true
  } catch (error) {
    console.error(`Failed to download poster for ${imdbId}:`, error)
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath)
    }
    return false
  }
}

function downloadImageOnce(url: string, filepath: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const request = client.get(url, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadImageOnce(redirectUrl, filepath, timeout).then(resolve).catch(reject)
          return
        }
      }

      // Check status code
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      // Create write stream
      const fileStream = fs.createWriteStream(filepath)

      response.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close()
        resolve()
      })

      fileStream.on('error', err => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath)
        }
        reject(err)
      })
    })

    request.on('error', reject)
    request.setTimeout(timeout, () => {
      request.destroy()
      reject(new Error('Request timeout'))
    })
  })
}
