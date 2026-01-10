/**
 * Movie JSON Generation Utility
 *
 * Splits the large data/movies.json into individual JSON files
 * in public/movies/[imdbId].json for on-demand loading.
 */

import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { loadMoviesDatabase } from './movieData'
import { loadCollectionsDatabase } from './collections'
import { createLogger } from './logger'
import type { MovieEntry, ArchiveOrgSource, YouTubeSource } from '../../shared/types/movie'
import type { Collection } from '../../shared/types/collections'

const logger = createLogger('MovieJSONGen')
const MOVIES_DIR = join(process.cwd(), 'public/movies')

export async function generateMovieJSON() {
  logger.info('Starting individual movie JSON generation...')

  // 1. Ensure directory exists
  if (!existsSync(MOVIES_DIR)) {
    logger.info(`Creating directory: ${MOVIES_DIR}`)
    mkdirSync(MOVIES_DIR, { recursive: true })
  } else {
    // 2. Cleanup existing files
    logger.info('Cleaning up existing JSON files...')
    const files = readdirSync(MOVIES_DIR)
    let deletedCount = 0
    for (const file of files) {
      if (file.endsWith('.json')) {
        unlinkSync(join(MOVIES_DIR, file))
        deletedCount++
      }
    }
    logger.info(`Deleted ${deletedCount} old JSON files`)
  }

  // 3. Load JSON data
  const db = await loadMoviesDatabase()
  const movies = Object.values(db).filter(
    (entry): entry is MovieEntry => typeof entry === 'object' && entry !== null && 'imdbId' in entry
  )

  logger.info(`Processing ${movies.length} movies`)

  // 3.5. Load collections and build movie-to-collections map
  logger.info('Loading collections...')
  const collectionsDb = await loadCollectionsDatabase()
  const collections = Object.entries(collectionsDb)
    .filter(([key]) => !key.startsWith('_'))
    .map(([_, value]) => value as Collection)

  // Build a map of movieId -> collections
  const movieToCollectionsMap = new Map<string, Array<{ id: string; name: string }>>()
  for (const collection of collections) {
    for (const movieId of collection.movieIds) {
      if (!movieToCollectionsMap.has(movieId)) {
        movieToCollectionsMap.set(movieId, [])
      }
      movieToCollectionsMap.get(movieId)!.push({
        id: collection.id,
        name: collection.name,
      })
    }
  }
  logger.info(`Loaded ${collections.length} collections`)

  // 4. Calculate Related Movies
  logger.info('Calculating related movies...')
  const processedMovies = movies.map(m => ({
    imdbId: m.imdbId,
    title: m.title,
    year: m.year,
    hasMetadata: !!m.metadata,
    imdbRating: m.metadata?.imdbRating,
    imdbVotes: m.metadata?.imdbVotes,
    language: m.metadata?.Language,
    sourceType: m.sources[0]?.type,
    channelName:
      m.sources[0]?.type === 'youtube' ? (m.sources[0] as YouTubeSource).channelName : undefined,
    genres: m.metadata?.Genre
      ? m.metadata.Genre.split(',')
          .map(g => g.trim().toLowerCase())
          .filter(Boolean)
      : [],
    actors: m.metadata?.Actors
      ? m.metadata.Actors.split(',')
          .map(a => a.trim().toLowerCase())
          .filter(Boolean)
      : [],
    director: m.metadata?.Director ? m.metadata.Director.toLowerCase() : null,
  }))

  const genreMap = new Map<string, string[]>()
  const actorMap = new Map<string, string[]>()
  const directorMap = new Map<string, string[]>()

  for (const m of processedMovies) {
    for (const g of m.genres) {
      if (!genreMap.has(g)) genreMap.set(g, [])
      genreMap.get(g)!.push(m.imdbId)
    }
    for (const a of m.actors) {
      if (!actorMap.has(a)) actorMap.set(a, [])
      actorMap.get(a)!.push(m.imdbId)
    }
    if (m.director) {
      if (!directorMap.has(m.director)) directorMap.set(m.director, [])
      directorMap.get(m.director)!.push(m.imdbId)
    }
  }

  const movieMap = new Map(processedMovies.map(m => [m.imdbId, m]))
  const relatedMap = new Map<
    string,
    Array<{
      imdbId: string
      title: string
      year?: number
      imdbRating?: string | number
      imdbVotes?: string | number
      language?: string
      sourceType?: 'archive.org' | 'youtube'
      channelName?: string
    }>
  >()

  for (let i = 0; i < processedMovies.length; i++) {
    const m1 = processedMovies[i]!
    const candidateScores = new Map<string, number>()

    for (const g of m1.genres) {
      for (const id of genreMap.get(g) || []) {
        if (id === m1.imdbId) continue
        candidateScores.set(id, (candidateScores.get(id) || 0) + 10)
      }
    }

    if (m1.director) {
      for (const id of directorMap.get(m1.director) || []) {
        if (id === m1.imdbId) continue
        candidateScores.set(id, (candidateScores.get(id) || 0) + 15)
      }
    }

    for (const a of m1.actors) {
      for (const id of actorMap.get(a) || []) {
        if (id === m1.imdbId) continue
        candidateScores.set(id, (candidateScores.get(id) || 0) + 5)
      }
    }

    const finalScores: { id: string; score: number }[] = []
    for (const [id2, baseScore] of candidateScores.entries()) {
      const m2 = movieMap.get(id2)!
      let score = baseScore
      if (m1.year && m2.year) {
        const yearDiff = Math.abs(m1.year - m2.year)
        if (yearDiff <= 5) score += (5 - yearDiff) * 2
      }
      if (m2.hasMetadata) score += 1
      finalScores.push({ id: id2, score })
    }

    finalScores.sort((a, b) => b.score - a.score)
    const topRelated = finalScores.slice(0, 12).map(r => {
      const rm = movieMap.get(r.id)!
      return {
        imdbId: rm.imdbId,
        title: rm.title,
        year: rm.year,
        imdbRating: rm.imdbRating,
        imdbVotes: rm.imdbVotes,
        language: rm.language,
        sourceType: rm.sourceType,
        channelName: rm.channelName,
      }
    })
    relatedMap.set(m1.imdbId, topRelated)

    if ((i + 1) % 5000 === 0) {
      logger.info(`Calculated related movies for ${i + 1} movies...`)
    }
  }

  // 5. Write individual files
  let count = 0
  for (const movie of movies) {
    const filePath = join(MOVIES_DIR, `${movie.imdbId}.json`)
    try {
      // Only store fields that are actually used in the UI
      const jsonData = {
        imdbId: movie.imdbId,
        title: movie.title,
        year: movie.year,
        sources: movie.sources.map(s => {
          const base: Partial<YouTubeSource | ArchiveOrgSource> = {
            type: s.type,
            url: s.url,
            title: s.title,
            description: s.description,
            quality: s.quality,
            label: s.label,
          }
          if (s.type === 'youtube') {
            const yt = s as YouTubeSource
            return {
              ...base,
              id: yt.id,
              channelName: yt.channelName,
              channelId: yt.channelId,
              regionRestriction: yt.regionRestriction,
            }
          } else {
            const ao = s as ArchiveOrgSource
            return {
              ...base,
              id: ao.id,
            }
          }
        }),
        // Only include metadata fields that are used in the UI
        metadata: movie.metadata
          ? {
              Rated: movie.metadata.Rated,
              Runtime: movie.metadata.Runtime,
              imdbRating: movie.metadata.imdbRating,
              imdbVotes:
                movie.metadata.imdbVotes && movie.metadata.imdbVotes !== 'N/A'
                  ? parseInt(movie.metadata.imdbVotes.replace(/,/g, ''), 10)
                  : null,
              Genre: movie.metadata.Genre,
              Plot: movie.metadata.Plot,
              Director: movie.metadata.Director,
              Writer: movie.metadata.Writer,
              Actors: movie.metadata.Actors,
              Language: movie.metadata.Language,
              Country: movie.metadata.Country,
              Awards: movie.metadata.Awards,
            }
          : undefined,
        relatedMovies: relatedMap.get(movie.imdbId) || [],
        collections: movieToCollectionsMap.get(movie.imdbId) || [],
        // Admin fields (localhost only)
        is_curated: !!movie.metadata,
        verified: !!movie.verified,
        qualityLabels: movie.qualityLabels || [],
        qualityNotes: movie.qualityNotes,
        lastUpdated: movie.lastUpdated,
      }

      writeFileSync(filePath, JSON.stringify(jsonData, null, 2))
      count++
      if (count % 1000 === 0) {
        logger.info(`Generated ${count} files...`)
      }
    } catch (err) {
      logger.error(`Failed to write JSON for movie ${movie.imdbId}:`, err)
    }
  }

  logger.success(`Successfully generated ${count} individual movie JSON files!`)
}
