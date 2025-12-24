import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MovieEntry } from '~/shared/types/movie'

interface DeduplicationResult {
  totalSources: number
  sourcesWithDescriptions: number
  boilerplateRemoved: number
  sourcesProcessed: number
  descriptionsRemoved: number
  patterns: Array<{
    pattern: string
    count: number
    description: string
  }>
}

// Smart boilerplate detection patterns
const BOILERPLATE_PATTERNS = [
  // Netzkino German boilerplate (most common)
  {
    pattern: 'netzkino_social',
    regex: /💙.*?(bit\.ly\/NetzkinoAbo|Netzkino).*?(facebook|instagram|tiktok|twitter)/is,
    description: 'Netzkino social media boilerplate',
  },
  {
    pattern: 'netzkino_subscription',
    regex: /💙.*?Ganze Filme.*?(abonnieren|streamen).*?bit\.ly/is,
    description: 'Netzkino subscription boilerplate',
  },

  // Generic boilerplate patterns
  {
    pattern: 'public_domain_generic',
    regex:
      /^(this film has fallen into the public domain|for academic.*?educational use only|public domain movies)\.?\s*$/i,
    description: 'Generic public domain notices',
  },
  {
    pattern: 'imdb_reference',
    regex: /^you can find more information regarding this film on its imdb page\.?\s*$/i,
    description: 'Generic IMDB references',
  },
  {
    pattern: 'short_generic',
    regex: /^(tr|assista clicando aqui|cine clásico|cine negro|drama|acción)\.?\s*$/i,
    description: 'Very short generic descriptions',
  },

  // URL-heavy descriptions (likely promotional)
  {
    pattern: 'url_heavy',
    regex: /https?:\/\/[^\s]+.*?https?:\/\/[^\s]+.*?https?:\/\/[^\s]+/i,
    description: 'Descriptions with 3+ URLs (promotional)',
  },

  // Silent Hall of Fame boilerplate
  {
    pattern: 'silent_hall_fame',
    regex:
      /this gem is presented by silent hall of fame.*?please visit.*?silent-hall-of-fame\.org/i,
    description: 'Silent Hall of Fame boilerplate',
  },

  // Very short descriptions that are likely not useful
  {
    pattern: 'too_short',
    regex: /^.{1,15}$/,
    description: 'Extremely short descriptions (< 16 chars)',
  },
]

function normalizeDescription(desc: unknown): string {
  if (typeof desc === 'string') {
    return desc.trim()
  } else if (Array.isArray(desc)) {
    return desc.join(' ').trim()
  } else {
    return String(desc).trim()
  }
}

function isBoilerplate(description: string): {
  isBoilerplate: boolean
  pattern?: string
  patternDesc?: string
} {
  // Skip empty or very short descriptions
  if (!description || description.length < 3) {
    return { isBoilerplate: true, pattern: 'empty', patternDesc: 'Empty or too short' }
  }

  // Check against all patterns
  for (const { pattern, regex, description: patternDesc } of BOILERPLATE_PATTERNS) {
    if (regex.test(description)) {
      return { isBoilerplate: true, pattern, patternDesc }
    }
  }

  return { isBoilerplate: false }
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

    let totalSources = 0
    let sourcesWithDescriptions = 0
    let sourcesProcessed = 0
    let descriptionsRemoved = 0
    const patternCounts: Record<string, { count: number; description: string }> = {}

    // Process all descriptions
    movies.forEach(movie => {
      movie.sources?.forEach(source => {
        totalSources++

        if (source.description) {
          const desc = normalizeDescription(source.description)
          sourcesWithDescriptions++

          const { isBoilerplate: isBoiler, pattern, patternDesc } = isBoilerplate(desc)

          if (isBoiler && pattern && patternDesc) {
            // Track pattern statistics
            if (!patternCounts[pattern]) {
              patternCounts[pattern] = { count: 0, description: patternDesc }
            }
            patternCounts[pattern].count++

            // Remove the boilerplate description
            delete source.description
            sourcesProcessed++
            descriptionsRemoved++
          }
        }
      })
    })

    // Prepare pattern statistics for response
    const patterns = Object.entries(patternCounts)
      .map(([pattern, { count, description }]) => ({
        pattern,
        count,
        description,
      }))
      .sort((a, b) => b.count - a.count)

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
      boilerplateRemoved: descriptionsRemoved,
      sourcesProcessed,
      descriptionsRemoved,
      patterns,
    }
  } catch (error) {
    console.error('Error deduplicating descriptions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to deduplicate descriptions',
    })
  }
})
