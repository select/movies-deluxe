import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { CollectionsDatabase, Collection } from '../../shared/types/collections'
import type { LightweightMovie, MovieSourceType } from '../../shared/types/movie'

const COLLECTIONS_PATH = path.join(process.cwd(), 'public/data/collections.json')
const DB_PATH = path.join(process.cwd(), 'public/data/movies.db')
const OUTPUT_DIR = path.join(process.cwd(), 'public/data/home')

interface MovieRow {
  movieId: string
  title: string
  year: number | null
  imdbRating: number | null
  imdbVotes: number | null
  language: string | null
  sourceType: MovieSourceType | null
  channelName: string | null
  verified: number | null
  genre: string | null
  country: string | null
}

function loadMoviesMetadata(): Map<string, LightweightMovie> {
  const movieMap = new Map<string, LightweightMovie>()
  if (!fs.existsSync(DB_PATH)) {
    return movieMap
  }

  let db: Database.Database | null = null
  try {
    db = new Database(DB_PATH, { readonly: true })
    const rows = db
      .prepare(
        `
        SELECT m.movieId, m.title, m.year, m.imdbRating, m.imdbVotes, m.language,
               m.primarySourceType as sourceType, m.primaryChannelName as channelName,
               m.verified, m.genre, m.country
        FROM movies m
      `
      )
      .all() as MovieRow[]

    for (const row of rows) {
      const movie: LightweightMovie = {
        movieId: row.movieId,
        title: row.title,
        ...(row.year !== null && { year: row.year }),
        ...(row.imdbRating !== null && { imdbRating: row.imdbRating }),
        ...(row.imdbVotes !== null && { imdbVotes: row.imdbVotes }),
        ...(row.language !== null && { language: row.language }),
        ...(row.sourceType !== null && { sourceType: row.sourceType }),
        ...(row.channelName !== null && { channelName: row.channelName }),
        ...(row.verified !== null && { verified: Boolean(row.verified) }),
        ...(row.genre !== null && { genre: row.genre }),
        ...(row.country !== null && { country: row.country }),
      }
      movieMap.set(row.movieId, movie)
    }
  } finally {
    db?.close()
  }

  return movieMap
}

// Simple seeded random generator (LCG)
class SeededRandom {
  private state: number
  constructor(seed: string) {
    this.state = this.hash(seed)
  }

  private hash(str: string): number {
    let h = 0
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
    }
    return h
  }

  next(): number {
    this.state = (Math.imul(1103515245, this.state) + 12345) & 0x7fffffff
    return this.state / 0x80000000
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      // Use array destructuring with explicit type assertion
      const [a, b] = [result[i], result[j]] as [T, T]
      result[i] = b
      result[j] = a
    }
    return result
  }

  pick<T>(array: T[], count: number): T[] {
    return this.shuffle(array).slice(0, count)
  }
}

export interface GenerationProgress {
  current: number
  total: number
  message: string
}

export async function generateHomePages(
  onProgress?: (progress: GenerationProgress) => void
): Promise<void> {
  if (!fs.existsSync(COLLECTIONS_PATH)) {
    throw new Error(`Collections file not found: ${COLLECTIONS_PATH}`)
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const collectionsData: CollectionsDatabase = JSON.parse(
    fs.readFileSync(COLLECTIONS_PATH, 'utf-8')
  )

  const allCollectionIds = Object.keys(collectionsData).filter(key => key !== '_schema')
  const collections = allCollectionIds
    .map(id => collectionsData[id])
    .filter((c): c is Collection => c !== undefined && typeof c === 'object' && 'movieIds' in c)
    .filter(c => c.enabled !== false) // Only include collections that are not explicitly disabled

  const moviesMetadata = loadMoviesMetadata()

  const validCollections = collections
    .map(c => ({
      ...c,
      movieIds: Array.from(new Set(c.movieIds)).filter(
        (id: string) => id.startsWith('tt') && (moviesMetadata.size === 0 || moviesMetadata.has(id))
      ),
    }))
    .filter(c => c.movieIds.length > 0)

  if (validCollections.length === 0) {
    throw new Error('No valid collections found with IMDB IDs.')
  }

  const totalDays = 31
  for (let day = 1; day <= totalDays; day++) {
    const seed = `home-page-day-${day}`
    const rng = new SeededRandom(seed)

    const pickedCollections = rng.pick(validCollections, 10)

    const homeData = {
      day,
      totalMovies: moviesMetadata.size,
      collections: pickedCollections.map(c => {
        const movieIds = rng.pick(c.movieIds, 9)
        const movies = movieIds
          .map(id => moviesMetadata.get(id))
          .filter((m): m is LightweightMovie => m !== undefined)

        return {
          id: c.id,
          name: c.name,
          movieIds,
          movies,
        }
      }),
    }

    const outputPath = path.join(OUTPUT_DIR, `day-${day}.json`)
    fs.writeFileSync(outputPath, JSON.stringify(homeData))

    if (onProgress) {
      onProgress({
        current: day,
        total: totalDays,
        message: `Generated home page for day ${day}`,
      })
    }
  }
}
