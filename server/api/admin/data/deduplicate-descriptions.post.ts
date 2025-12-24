import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MovieEntry } from '~/shared/types/movie'

interface DeduplicationResult {
  totalSources: number
  sourcesWithDescriptions: number
  duplicatesFound: number
  sourcesProcessed: number
  descriptionsRemoved: number
  topDuplicates: Array<{
    description: string
    count: number
    preview: string
  }>
}

export default defineEventHandler(async (event): Promise<DeduplicationResult> => {
  // Only allow POST requests
  assertMethod(event, 'POST')

  try {
    // Read the current movies.json file
    const moviesPath = join(process.cwd(), 'public/data/movies.json')
    const rawData = readFileSync(moviesPath, 'utf8')
    const data = JSON.parse(rawData)

    // Extract movies (filter out _schema)
    const movies = Object.values(data).filter(
      (item: unknown) => (item as MovieEntry).imdbId
    ) as MovieEntry[]

    // Analyze descriptions to find duplicates
    const descriptionCounts: Record<string, number> = {}
    let totalSources = 0
    let sourcesWithDescriptions = 0

    // First pass: count all descriptions
    movies.forEach(movie => {
      movie.sources?.forEach(source => {
        totalSources++
        if (source.description) {
          let desc = ''
          if (typeof source.description === 'string') {
            desc = source.description.trim()
          } else if (Array.isArray(source.description)) {
            desc = source.description.join(' ').trim()
          } else {
            desc = String(source.description).trim()
          }

          if (desc) {
            sourcesWithDescriptions++
            descriptionCounts[desc] = (descriptionCounts[desc] || 0) + 1
          }
        }
      })
    })

    // Find duplicates (descriptions used more than once)
    const duplicates = Object.entries(descriptionCounts)
      .filter(([_desc, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])

    // Get top duplicates for reporting
    const topDuplicates = duplicates.slice(0, 10).map(([desc, count]) => ({
      description: desc,
      count,
      preview: desc.substring(0, 100) + (desc.length > 100 ? '...' : ''),
    }))

    // Second pass: remove duplicate descriptions
    let sourcesProcessed = 0
    let descriptionsRemoved = 0
    const duplicateDescriptions = new Set(duplicates.map(([desc]) => desc))
    const processedDescriptions = new Set<string>()

    movies.forEach(movie => {
      movie.sources?.forEach(source => {
        if (source.description) {
          let desc = ''
          if (typeof source.description === 'string') {
            desc = source.description.trim()
          } else if (Array.isArray(source.description)) {
            desc = source.description.join(' ').trim()
          } else {
            desc = String(source.description).trim()
          }

          if (desc && duplicateDescriptions.has(desc)) {
            sourcesProcessed++

            // If we've already seen this description, remove it
            if (processedDescriptions.has(desc)) {
              delete source.description
              descriptionsRemoved++
            } else {
              // First occurrence, keep it and mark as processed
              processedDescriptions.add(desc)
            }
          }
        }
      })
    })

    // Write the updated data back to the file
    const updatedData = {
      _schema: data._schema,
      ...Object.fromEntries(movies.map(movie => [movie.imdbId, movie])),
    }

    // Update the lastUpdated timestamp
    if (updatedData._schema) {
      updatedData._schema.lastUpdated = new Date().toISOString()
    }

    writeFileSync(moviesPath, JSON.stringify(updatedData, null, 2))

    return {
      totalSources,
      sourcesWithDescriptions,
      duplicatesFound: duplicates.length,
      sourcesProcessed,
      descriptionsRemoved,
      topDuplicates,
    }
  } catch (error) {
    console.error('Error deduplicating descriptions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to deduplicate descriptions',
    })
  }
})
