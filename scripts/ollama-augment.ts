#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PLAYLIST_FILE = path.join(
  __dirname,
  '../public/playlist/PLHh-DPsAXiAUVUVA9DpRtiYRrwgvqg8Fx.json'
)
const SONGS_DIR = path.join(__dirname, '../server/assets/songs')

interface Video {
  id: string
  title: string
  channel: string
  duration: string
  artist?: string
  musicTitle?: string
  tags?: string[]
  createdAt?: number
  userId?: string | null
  externalIds?: Record<string, string>
  listeners?: number
  playcount?: number
  lastfmSummary?: string
}

interface Playlist {
  id: string
  title: string
  description: string
  videoCount: number
  videos: Video[]
  lastFetched: string
}

interface SongMetaData {
  mbid?: string
  trackMbid?: string
  title: string
  artist?: string
  artistMbid?: string
  album?: string
  releaseCount?: number
  duration?: number
  youtubeId: string
  lastFetched: string
  datetime?: number
  userId?: string | null
  odesli?: Record<string, string>
  ai?: {
    title?: string
    artist?: string
  }
  musicbrainz?: {
    tags?: string[]
    genres?: string[]
    artistTags?: string[]
    artistGenres?: string[]
  }
  lastfm?: {
    summary?: string
    tags?: string[]
    playcount?: number
    listeners?: number
    id?: string
    mbid?: string
    artistMbid?: string
  }
}

interface OllamaResponse {
  message: {
    content: string
  }
}

interface OllamaConfig {
  host: string
  model: string
}

const DEFAULT_CONFIG: OllamaConfig = {
  host: 'http://localhost:11434',
  model: 'gemma3:4b',
}

// Load playlist data
function loadPlaylist(): Playlist {
  try {
    const data = fs.readFileSync(PLAYLIST_FILE, 'utf8')
    return JSON.parse(data) as Playlist
  } catch (error) {
    console.error('Error loading playlist:', (error as Error).message)
    process.exit(1)
  }
}

// Check if song file exists and load it
function loadSongFile(youtubeId: string): SongMetaData | null {
  const songFilePath = path.join(SONGS_DIR, `${youtubeId}.json`)
  try {
    const data = fs.readFileSync(songFilePath, 'utf8')
    return JSON.parse(data) as SongMetaData
  } catch {
    return null
  }
}

// Save song file
function saveSongFile(youtubeId: string, data: SongMetaData): void {
  const songFilePath = path.join(SONGS_DIR, `${youtubeId}.json`)
  try {
    fs.writeFileSync(songFilePath, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.error(`Error saving song file ${youtubeId}:`, (error as Error).message)
  }
}

// Check if Ollama model is available
async function isOllamaModelAvailable(model: string, host = DEFAULT_CONFIG.host): Promise<boolean> {
  try {
    const response = await fetch(`${host}/api/tags`)
    if (!response.ok) return false

    const data = (await response.json()) as { models?: Array<{ name: string }> }
    return data.models?.some(m => m.name.includes(model)) ?? false
  } catch {
    return false
  }
}

// Make Ollama request
async function ollamaChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  host = DEFAULT_CONFIG.host
): Promise<OllamaResponse> {
  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: 'json',
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

// Create metadata extraction prompt
function createMetadataPrompt(title: string, channel: string): string {
  return `You are a music metadata extraction expert. Given a YouTube video title and channel name, extract the artist name, track name.

Title: "${title}"
Channel: "${channel}"

Please analyze this information and extract:
1. Artist name (the main performing artist)
2. Track name (the song title, cleaned up)

Guidelines:
- Remove common YouTube suffixes like "(Official Video)", "(Lyric Video)", "[HD]", etc.
- If the artist is not clear from the title, use the channel name as a fallback
- When the channel ends with - Topic e.g. "xxx - Topic" then the artist is "xxx"
Examples:



IN
Title: Knebelfreunde
Channel: L.F.T. - Topic
OUT
{
  "artist": "L.F.T.",
  "track": "Knebelfreunde"
}
IN
Title: Breakdance Tool
Channel: Carl Hang - Topic
OUT
{
  "artist": "Carl Hang",
  "track": "Breakdance Tool"
}
IN
Title: "Norwegian Recycling - Miracles"
Channel: "NorwegianRecycling"
OUT
{
  "artist": "Norwegian Recycling",
  "track": "Miracles"
}
IN
Title: "Carmen Electra - Go Go Dancer MUSIC VIDEO [HQ]"
Channel: "il Russo"
OUT
{
  "artist": "Carmen Electra",
  "track": "Go Go Dancer"
}
IN
Title: "Stefanie Hertel - Ich wünsch' mir einen kleinen Teddybär - 1985"
Channel: "VHS-Goldie"
OUT
{
  "artist": "Stefanie Hertel",
  "track": "Ich wünsch' mir einen kleinen Teddybär"
}


Respond in valid JSON format only:
{
  "artist": "extracted artist name",
  "track": "extracted track name"
}`
}

// Extract JSON from response
function extractJsonFromResponse(content: string): string | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  return jsonMatch?.[0] ?? null
}

// Parse metadata response
function parseMetadataResponse(
  content: string,
  title: string
): { artist: string; track: string } | null {
  const jsonString = extractJsonFromResponse(content.trim())
  if (!jsonString) {
    console.warn(`No JSON found in response for "${title}"`)
    return null
  }

  try {
    const extracted = JSON.parse(jsonString)

    if (!extracted?.artist || !extracted?.track) {
      console.warn(`Invalid metadata structure for "${title}"`, JSON.stringify(extracted, null, 2))
      return null
    }

    return {
      artist: extracted.artist.trim(),
      track: extracted.track.trim(),
    }
  } catch (error) {
    console.error(`Error parsing JSON for "${title}":`, error)
    return null
  }
}

// Extract metadata with Ollama
async function extractMetadataWithOllama(
  youtubeId: string,
  title: string,
  channel: string,
  config: Partial<OllamaConfig> = {}
): Promise<{ title: string; artist: string } | null> {
  const { host, model } = { ...DEFAULT_CONFIG, ...config }

  try {
    // Check if model is available
    const modelAvailable = await isOllamaModelAvailable(model, host)
    if (!modelAvailable) {
      console.warn(`Model ${model} not available`)
      return null
    }

    const prompt = createMetadataPrompt(title, channel)
    const response = await ollamaChat(model, [{ role: 'user', content: prompt }], host)

    const extracted = parseMetadataResponse(response.message.content, title)
    if (!extracted) {
      return null
    }

    return {
      artist: extracted.artist,
      title: extracted.track,
    }
  } catch (error) {
    console.error(`Error extracting metadata for "${title}":`, error)
    return null
  }
}

async function main(): Promise<void> {
  console.log('Starting ollama-augment script...')
  console.log('Checking for missing AI metadata in song files...')

  // Load playlist
  const playlist = loadPlaylist()
  console.log(`Loaded playlist with ${playlist.videos.length} videos`)

  // Check Ollama availability
  const modelAvailable = await isOllamaModelAvailable(DEFAULT_CONFIG.model)
  if (!modelAvailable) {
    console.error(
      `Ollama model ${DEFAULT_CONFIG.model} is not available. Please ensure Ollama is running and the model is installed.`
    )
    process.exit(1)
  }

  let processedCount = 0
  let successCount = 0
  let skipCount = 0
  let failCount = 0

  for (const video of playlist.videos) {
    processedCount++

    // Load existing song file or create new one
    let existingSong = loadSongFile(video.id)

    if (!existingSong) {
      // console.log("📁 Creating new song file...");
      existingSong = {
        youtubeId: video.id,
        title: video.title,
        lastFetched: new Date().toISOString(),
      }
    }

    // Check if LastFM data or AI data already exists (skip conditions)
    if (existingSong.lastfm) {
      // console.log("⏭️  LastFM data already exists, skipping...");
      skipCount++
      continue
    }
    // Check if LastFM data or AI data already exists (skip conditions)
    if (existingSong.artist) {
      // console.log("⏭️  Artist exists, skipping...");
      skipCount++
      continue
    }

    if (existingSong.ai?.title && existingSong.ai?.artist) {
      // console.log("⏭️  AI data already exists, skipping...");
      skipCount++
      continue
    }
    console.log(`\n[${processedCount}/${playlist.videos.length}] Processing: ${video.id}`)
    console.log(`Title: ${video.title}`)
    console.log(`Channel: ${video.channel}`)

    console.log('🤖 Extracting AI metadata...')

    // Extract metadata using Ollama
    const aiMetadata = await extractMetadataWithOllama(video.id, video.title, video.channel)

    if (aiMetadata) {
      // Add AI data to existing song
      existingSong.ai = {
        title: aiMetadata.title,
        artist: aiMetadata.artist,
      }

      // Save updated song file
      saveSongFile(video.id, existingSong)

      successCount++
      console.log('✅ Success! AI metadata extracted and saved.')
      console.log(`   AI Artist: "${aiMetadata.artist}"`)
      console.log(`   AI Title: "${aiMetadata.title}"`)
    } else {
      failCount++
      console.log('❌ Failed to extract AI metadata')
    }

    // Progress update
    if (processedCount % 10 === 0) {
      console.log(`⏳ Processed ${processedCount} videos so far...`)
    }

    // Small delay to be respectful to Ollama
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log('\n=== Summary ===')
  console.log(`Total processed: ${processedCount}`)
  console.log(`Skipped (has LastFM or AI data): ${skipCount}`)
  console.log(`Successful extractions: ${successCount}`)
  console.log(`Failed extractions: ${failCount}`)

  if (successCount > 0) {
    console.log('\n🎵 AI metadata has been extracted and saved successfully!')
  }

  console.log('\nScript completed!')
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT. Gracefully shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM. Gracefully shutting down...')
  process.exit(0)
})

// Run the script
main().catch(error => {
  console.error('Script error:', error)
  process.exit(1)
})
