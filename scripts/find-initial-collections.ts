import { readFile } from 'fs/promises'
import { join } from 'path'

async function findMovies() {
  const filePath = join(process.cwd(), 'public/data/movies.json')
  const content = await readFile(filePath, 'utf-8')
  const db = JSON.parse(content)

  const chaplinIds = []
  const animationIds = []

  for (const [id, movie] of Object.entries(db)) {
    if (id.startsWith('_')) continue
    const m = movie as any
    const title = String(m.title || '')
    const actors = String(m.metadata?.Actors || '')
    const director = String(m.metadata?.Director || '')
    const description = String(m.sources?.[0]?.description || '')

    if (
      title.toLowerCase().includes('charlie chaplin') ||
      actors.toLowerCase().includes('charlie chaplin') ||
      director.toLowerCase().includes('charlie chaplin') ||
      description.toLowerCase().includes('charlie chaplin')
    ) {
      chaplinIds.push(id)
    }

    if (
      title.toLowerCase().includes('popeye') ||
      title.toLowerCase().includes('betty boop') ||
      title.toLowerCase().includes('felix the cat') ||
      description.toLowerCase().includes('popeye')
    ) {
      animationIds.push(id)
    }
  }

  console.log('Charlie Chaplin IDs:', JSON.stringify(chaplinIds))
  console.log('Animation Shorts IDs:', JSON.stringify(animationIds))
}

findMovies()
