import fs from 'node:fs'
import path from 'node:path'
import type { CollectionsDatabase, Collection } from '../../shared/types/collections'

const COLLECTIONS_PATH = path.join(process.cwd(), 'public/data/collections.json')
const OUTPUT_DIR = path.join(process.cwd(), 'public/data/home')

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

export async function generateHomePages(onProgress?: (progress: GenerationProgress) => void) {
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

  const validCollections = collections
    .map(c => ({
      ...c,
      movieIds: c.movieIds.filter((id: string) => id.startsWith('tt')),
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
      collections: pickedCollections.map(c => ({
        id: c.id,
        name: c.name,
        movieIds: rng.pick(c.movieIds, 10),
      })),
    }

    const outputPath = path.join(OUTPUT_DIR, `day-${day}.json`)
    fs.writeFileSync(outputPath, JSON.stringify(homeData, null, 2))

    if (onProgress) {
      onProgress({
        current: day,
        total: totalDays,
        message: `Generated home page for day ${day}`,
      })
    }
  }
}
