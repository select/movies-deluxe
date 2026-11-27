import { defineNuxtPlugin } from '#app'
import { useDatabase } from '~/composables/useDatabase'
import { useVectorSearch } from '~/composables/useVectorSearch'
import { useMovieStore } from '~/stores/useMovieStore'
import { useCollectionsStore } from '~/stores/useCollectionsStore'
import { parseSearchQuery } from '~/utils/searchQueryParser'
import type { ModelContext, ModelContextTool, ModelContextToolResult } from '~/types/webmcp'
import type { LightweightMovie, SortDirection, SortField } from '~/types'

interface SearchMoviesInput {
  query?: string
  genres?: string[]
  countries?: string[]
  sources?: string[]
  minRating?: number
  minYear?: number
  maxYear?: number
  minVotes?: number
  maxVotes?: number
  sortBy?: SortField
  sortDirection?: SortDirection
  limit?: number
}

interface SemanticSearchMoviesInput {
  query: string
  limit?: number
}

interface GetMovieDetailsInput {
  movieId: string
}

interface ListCollectionsInput {
  collectionId?: string
  category?: string
}

function getModelContext(): ModelContext | null {
  if (typeof navigator !== 'undefined' && navigator.modelContext?.registerTool) {
    return navigator.modelContext
  }
  if (typeof document !== 'undefined' && document.modelContext?.registerTool) {
    return document.modelContext
  }
  return null
}

function formatResult(data: unknown, isError = false): ModelContextToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  }
}

function formatFtsPhrase(term: string): string | null {
  const trimmed = term.replace(/\0/g, '').trim()
  if (!trimmed) return null
  return `"${trimmed.replace(/"/g, '""')}"`
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export default defineNuxtPlugin(() => {
  const modelContext = getModelContext()
  if (!modelContext) {
    return
  }

  const registeredNames: string[] = []

  const register = <TInput>(tool: ModelContextTool<TInput>) => {
    try {
      modelContext.registerTool(tool)
      registeredNames.push(tool.name)
    } catch (err) {
      console.warn(`[WebMCP] Failed to register tool "${tool.name}":`, err)
    }
  }

  register<SearchMoviesInput>({
    name: 'search_movies',
    description:
      'Search and filter free/public-domain movies in the local SQLite database. Supports field prefixes (actor:, director:, writer:, title:), quoted phrases, genre/country/source/rating/year/votes filters, and sorting.',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query. Supports field prefixes like actor:"Roy Rogers", director:Hitchcock, writer:Wilder, title:Metropolis, or general keywords.',
        },
        genres: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by genres (OR within list), e.g. ["Drama", "Film-Noir"].',
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by countries (OR within list), e.g. ["USA", "Germany"].',
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by source ("archive.org" or YouTube channel name like "Netzkino").',
        },
        minRating: {
          type: 'number',
          description: 'Minimum IMDb rating (0-10).',
        },
        minYear: {
          type: 'integer',
          description: 'Minimum release year.',
        },
        maxYear: {
          type: 'integer',
          description: 'Maximum release year.',
        },
        minVotes: {
          type: 'integer',
          description: 'Minimum IMDb vote count.',
        },
        maxVotes: {
          type: 'integer',
          description: 'Maximum IMDb vote count.',
        },
        sortBy: {
          type: 'string',
          enum: ['year', 'rating', 'title', 'votes', 'relevance'],
          description: 'Sort field (default: relevance when query is set, otherwise year).',
        },
        sortDirection: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default: desc, or asc for title).',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of movies to return (default: 20, max: 100).',
          minimum: 1,
          maximum: 100,
        },
      },
    },
    execute: async input => {
      try {
        const movieStore = useMovieStore()
        const db = useDatabase()
        await movieStore.loadFromFile()

        const queryText = input?.query?.trim() || ''
        const limit = Math.min(Math.max(Number(input?.limit) || 20, 1), 100)
        const params: (string | number)[] = []

        let whereSql = 'WHERE 1=1'
        if (queryText) {
          const parsed = parseSearchQuery(queryText)
          const ftsTerms: string[] = []

          if (parsed.title) {
            const phrase = formatFtsPhrase(parsed.title)
            if (phrase) ftsTerms.push(`title:${phrase}`)
          }
          if (parsed.actors) {
            for (const actor of parsed.actors) {
              const phrase = formatFtsPhrase(actor)
              if (phrase) ftsTerms.push(`actors:${phrase}`)
            }
          }
          if (parsed.directors) {
            for (const director of parsed.directors) {
              const phrase = formatFtsPhrase(director)
              if (phrase) ftsTerms.push(`directors:${phrase}`)
            }
          }
          if (parsed.writers) {
            for (const writer of parsed.writers) {
              const phrase = formatFtsPhrase(writer)
              if (phrase) ftsTerms.push(`writers:${phrase}`)
            }
          }
          if (parsed.general) {
            const phrase = formatFtsPhrase(parsed.general)
            if (phrase) ftsTerms.push(ftsTerms.length > 0 ? `title:${phrase}` : phrase)
          }

          if (ftsTerms.length > 0) {
            whereSql = 'WHERE m.rowid IN (SELECT rowid FROM fts_search WHERE fts_search MATCH ?)'
            params.push(ftsTerms.join(' AND '))
          }
        }

        if (input?.minRating && input.minRating > 0) {
          whereSql += ' AND m.imdbRating >= ?'
          params.push(input.minRating)
        }
        if (input?.minYear && input.minYear > 0) {
          whereSql += ' AND m.year >= ?'
          params.push(input.minYear)
        }
        if (input?.maxYear && input.maxYear > 0) {
          whereSql += ' AND m.year <= ?'
          params.push(input.maxYear)
        }
        if (input?.minVotes && input.minVotes > 0) {
          whereSql += ' AND m.imdbVotes >= ?'
          params.push(input.minVotes)
        }
        if (input?.maxVotes && input.maxVotes > 0) {
          whereSql += ' AND m.imdbVotes <= ?'
          params.push(input.maxVotes)
        }

        if (input?.sources?.length) {
          const sourceConds: string[] = []
          for (const source of input.sources) {
            if (source === 'archive.org') {
              sourceConds.push('m.primarySourceType = ?')
              params.push('archive.org')
            } else {
              sourceConds.push('(m.primarySourceType = ? AND m.primaryChannelName = ?)')
              params.push('youtube', source)
            }
          }
          whereSql += ` AND (${sourceConds.join(' OR ')})`
        }

        if (input?.genres?.length) {
          const genreConds = input.genres.map(
            () => '(m.genre LIKE ? OR m.genre LIKE ? OR m.genre LIKE ? OR m.genre = ?)'
          )
          for (const genre of input.genres) {
            params.push(`${genre},%`, `%, ${genre},%`, `%, ${genre}`, genre)
          }
          whereSql += ` AND (${genreConds.join(' OR ')})`
        }

        if (input?.countries?.length) {
          const countryConds = input.countries.map(
            () => '(m.country LIKE ? OR m.country LIKE ? OR m.country LIKE ? OR m.country = ?)'
          )
          for (const country of input.countries) {
            params.push(`${country},%`, `%, ${country},%`, `%, ${country}`, country)
          }
          whereSql += ` AND (${countryConds.join(' OR ')})`
        }

        const sortBy = input?.sortBy || (queryText ? 'relevance' : 'year')
        const sortDir =
          input?.sortDirection === 'asc' || input?.sortDirection === 'desc'
            ? input.sortDirection
            : sortBy === 'title'
              ? 'asc'
              : 'desc'

        let orderSql = 'ORDER BY m.year DESC'
        if (sortBy === 'year') {
          orderSql = `ORDER BY m.year ${sortDir === 'asc' ? 'ASC' : 'DESC'}`
        } else if (sortBy === 'rating') {
          orderSql = `ORDER BY m.imdbRating ${sortDir === 'asc' ? 'ASC' : 'DESC'}`
        } else if (sortBy === 'title') {
          orderSql = `ORDER BY m.title ${sortDir === 'asc' ? 'ASC' : 'DESC'}`
        } else if (sortBy === 'votes') {
          orderSql = `ORDER BY m.imdbVotes ${sortDir === 'asc' ? 'ASC' : 'DESC'}`
        } else if (sortBy === 'relevance' && queryText) {
          orderSql = 'ORDER BY m.title ASC'
        }

        const countRows = await db.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM movies m ${whereSql}`,
          params
        )
        const totalMatches = countRows[0]?.total ?? 0

        const rows = await db.query<LightweightMovie>(
          `SELECT m.movieId, m.title, m.year, m.imdbRating, m.imdbVotes, m.language,
                  m.primarySourceType as sourceType, m.primaryChannelName as channelName,
                  m.verified, m.genre, m.country
           FROM movies m
           ${whereSql}
           ${orderSql}
           LIMIT ?`,
          [...params, limit]
        )

        return formatResult({
          totalMatches,
          returned: rows.length,
          movies: rows.map(movie => ({
            ...movie,
            url: `/movie/${movie.movieId}`,
          })),
        })
      } catch (err) {
        return formatResult(
          { error: err instanceof Error ? err.message : 'Failed to search movies' },
          true
        )
      }
    },
  })

  register<SemanticSearchMoviesInput>({
    name: 'semantic_search_movies',
    description:
      'Search movies by natural language plot, mood, or theme using browser-side vector embeddings (leaf-ir + sqlite-vec).',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what you want to watch.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 10, max: 50).',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
    execute: async input => {
      try {
        const queryText = input?.query?.trim()
        if (!queryText) {
          return formatResult({ error: 'query is required' }, true)
        }
        const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 50)
        const vectorSearch = useVectorSearch()
        const results = await vectorSearch.search(queryText, limit)
        if (vectorSearch.error.value) {
          return formatResult({ error: vectorSearch.error.value }, true)
        }
        return formatResult({
          query: queryText,
          returned: results.length,
          movies: results.map(movie => ({
            movieId: movie.movieId,
            title: movie.title,
            year: movie.year,
            imdbRating: movie.imdbRating,
            imdbVotes: movie.imdbVotes,
            genre: movie.genre,
            country: movie.country,
            sourceType: movie.sourceType,
            channelName: movie.channelName,
            distance: movie.distance,
            url: `/movie/${movie.movieId}`,
          })),
        })
      } catch (err) {
        return formatResult(
          { error: err instanceof Error ? err.message : 'Semantic search failed' },
          true
        )
      }
    },
  })

  register<GetMovieDetailsInput>({
    name: 'get_movie_details',
    description:
      'Fetch full metadata, plot, cast, director, writers, streaming sources (Archive.org / YouTube), collections, and similar movies for a movie by its movieId.',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        movieId: {
          type: 'string',
          description: 'Movie ID (e.g. "tt0082096" or "archive-...").',
        },
      },
      required: ['movieId'],
    },
    execute: async input => {
      try {
        const movieId = input?.movieId?.trim()
        if (!movieId) {
          return formatResult({ error: 'movieId is required' }, true)
        }
        const movieStore = useMovieStore()
        const movie = await movieStore.getMovieById(movieId)
        if (!movie) {
          return formatResult({ error: `Movie not found: ${movieId}` }, true)
        }
        return formatResult({
          ...movie,
          url: `/movie/${movie.movieId}`,
        })
      } catch (err) {
        return formatResult(
          { error: err instanceof Error ? err.message : 'Failed to fetch movie details' },
          true
        )
      }
    },
  })

  register<ListCollectionsInput>({
    name: 'list_collections',
    description:
      'List curated movie collections with summaries and movie counts, or fetch a specific collection by collectionId including its movieIds.',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'Optional collection ID (e.g. "top-movies", "film-noir") to fetch in full.',
        },
        category: {
          type: 'string',
          description: 'Optional category filter when listing all collections.',
        },
      },
    },
    execute: async input => {
      try {
        const collectionsStore = useCollectionsStore()
        await collectionsStore.loadCollections()

        if (input?.collectionId?.trim()) {
          const collection = await collectionsStore.getCollectionById(input.collectionId.trim())
          if (!collection) {
            return formatResult({ error: `Collection not found: ${input.collectionId}` }, true)
          }
          return formatResult({
            ...collection,
            movieCount: collection.movieIds.length,
            url: `/collections/${collection.id}`,
          })
        }

        const categoryFilter = input?.category?.trim().toLowerCase()
        const list = Array.from(collectionsStore.collections.values())
          .filter(c => c.enabled !== false)
          .filter(c => !categoryFilter || c.category?.toLowerCase() === categoryFilter)
          .map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            category: c.category,
            tags: c.tags,
            movieCount: c.movieIds.length,
            url: `/collections/${c.id}`,
          }))

        return formatResult({
          total: list.length,
          collections: list,
        })
      } catch (err) {
        return formatResult(
          { error: err instanceof Error ? err.message : 'Failed to list collections' },
          true
        )
      }
    },
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (modelContext.unregisterTool) {
        for (const name of registeredNames) {
          modelContext.unregisterTool(name)
        }
      }
    })
  }
})
