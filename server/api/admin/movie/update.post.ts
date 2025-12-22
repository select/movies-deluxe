import { defineEventHandler, readBody, createError } from 'h3'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { movieId, newImdbId, metadata, removeMetadata, verified } = body

  if (!movieId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'movieId is required',
    })
  }

  try {
    const filePath = join(process.cwd(), 'public/data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    const db = JSON.parse(content)

    let movie = db[movieId]
    if (!movie) {
      throw createError({
        statusCode: 404,
        statusMessage: `Movie with ID ${movieId} not found`,
      })
    }

    let currentId = movieId

    // Handle metadata removal
    if (removeMetadata) {
      delete movie.metadata
      movie.verified = false

      // If it was matched to an IMDB ID, migrate it back to a temporary ID
      if (currentId.startsWith('tt') && movie.sources && movie.sources.length > 0) {
        const source = movie.sources[0]
        let tempId = currentId
        if (source.type === 'youtube') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tempId = `youtube-${(source as any).videoId}`
        } else if (source.type === 'archive.org') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tempId = `archive-${(source as any).identifier}`
        }

        if (tempId !== currentId) {
          const existing = db[tempId]
          if (existing) {
            // Merge sources

            existing.sources = [
              ...existing.sources,
              ...movie.sources.filter(
                (s: any) => !existing.sources.some((es: any) => es.url === s.url)
              ),
            ]
            existing.lastUpdated = new Date().toISOString()
            delete db[currentId]
            currentId = tempId
            movie = existing
          } else {
            movie.imdbId = tempId
            db[tempId] = movie
            delete db[currentId]
            currentId = tempId
          }
        }
      }
    }

    // Handle metadata update
    if (metadata) {
      movie.metadata = metadata
    }

    if (verified !== undefined) {
      movie.verified = verified
    }

    movie.lastUpdated = new Date().toISOString()

    // Handle ID migration if new ID is provided (either explicitly or via metadata)
    const targetId = newImdbId || metadata?.imdbID
    const finalId = targetId || currentId

    // Download poster if metadata has one
    const posterUrl = metadata?.Poster || metadata?.poster
    if (posterUrl && posterUrl !== 'N/A' && finalId.startsWith('tt')) {
      // We don't await this to avoid blocking the response,
      // but we could if we want to ensure it's done.
      // For curation, it's better to at least start it.
      downloadPoster(posterUrl, finalId).catch(err => {
        console.error('Background poster download failed:', err)
      })
    }

    if (targetId && targetId !== currentId) {
      const existing = db[targetId]
      if (existing) {
        // Merge

        existing.sources = [
          ...existing.sources,
          ...movie.sources.filter(
            (s: any) => !existing.sources.some((es: any) => es.url === s.url)
          ),
        ]
        existing.metadata = movie.metadata || existing.metadata
        existing.verified = movie.verified || existing.verified
        existing.lastUpdated = new Date().toISOString()
        delete db[currentId]
      } else {
        movie.imdbId = targetId
        db[targetId] = movie
        delete db[currentId]
      }
    }

    db._schema.lastUpdated = new Date().toISOString()
    await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')

    return { success: true, movieId: finalId }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update movie: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
