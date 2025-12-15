interface OmdbMovieDetails {
  Title: string
  Year: string
  imdbID: string
  Rated: string
  Released: string
  Runtime: string
  Genre: string
  Director: string
  Writer: string
  Actors: string
  Plot: string
  Language: string
  Country: string
  Awards?: string
  Poster?: string
  Ratings?: Array<{ Source: string; Value: string }>
  Metascore?: string
  imdbRating: string
  imdbVotes: string
  Type?: string
  DVD?: string
  BoxOffice?: string
  Production?: string
  Website?: string
  Response: string
  Error?: string
}

interface Movie {
  title: string
  identifier: string
  description?: string
  date?: string
  year?: string
  creator?: string | string[]
  subject?: string[]
  collection?: string[]
  downloads?: number
  mediatype?: string
  thumbnailUrl?: string
  downloadUrl?: string
}

interface MovieDetails {
  metadata?: {
    thumbnail?: string
    [key: string]: any
  }
  files?: Array<{
    name: string
    [key: string]: any
  }>
  [key: string]: any
}

interface LoadingState {
  movies: boolean
  movieDetails: boolean
  saving: boolean
  imdbFetch: boolean
}

type SavingStatus = Record<string, 'saving' | 'saved' | 'error'>

export const useMovieStore = defineStore('movie', () => {
  const movies = ref<Movie[]>([])
  const isLoading = ref<LoadingState>({
    movies: false,
    movieDetails: false,
    saving: false,
    imdbFetch: false,
  })

  const savingStatus = ref<SavingStatus>({})

  // Helper function to validate OMDB API key
  const validateOmdbApiKey = (): string | null => {
    const apiKey = useRuntimeConfig().public.OMDB_API_KEY

    if (!apiKey) {
      useMessageStore().showMessage({
        type: 'error',
        body: 'OMDB_API_KEY is not configured in runtime config',
      })
      isLoading.value.imdbFetch = false
      return null
    }

    return apiKey
  }

  const fetchArchiveOrgMovies = async () => {
    isLoading.value.movies = true

    const allMovies: Movie[] = []
    const rowsPerPage = 100 // Number of results per page
    const totalPages = 2 // Number of pages to fetch

    // Fetch 5 pages of results
    for (let page = 0; page < totalPages; page++) {
      const { data, error } = await request<{ response: { docs: Movie[] } }>(
        'https://archive.org/advancedsearch.php',
        {
          params: {
            q: 'mediatype:movies AND collection:feature_films',
            output: 'json',
            rows: rowsPerPage,
            start: page * rowsPerPage, // Pagination offset
            sort: 'downloads desc', // Sort by most downloaded
          },
        }
      )

      if (error || !data) continue
      const pageMovies = data.response.docs || []
      allMovies.push(...pageMovies)
      // Break early if we get fewer results than expected (last page)
      if (pageMovies.length < rowsPerPage) break
    }

    movies.value = allMovies
    console.log('allMovies', allMovies)

    isLoading.value.movies = false
  }

  // Fetch movies from Strapi
  const fetchMovies = async (all?: false) => {
    isLoading.value.movies = true
    const { find } = useStrapi()

    if (all) {
      const response = await find<Movie[]>('movies', {
        populate: ['poster', 'links'],
      })
      if (response) {
        movies.value = response.data
      }
    } else {
      // Fetch movies that have an imdbId using GraphQL
      const graphql = useStrapiGraphQL()
      const response = await graphql(`
        query GetMoviesWithImdbId {
          movies(filters: { imdbId: { notNull: true } }) {
            data {
              id
              attributes {
                title
                poster {
                  data {
                    attributes {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      `)
      console.log('response', response)

      if (response?.movies?.data) {
        movies.value = response.movies.data
      }
    }

    isLoading.value.movies = false
  }

  // Add a function to fetch movie details by identifier
  const fetchMovieDetails = async (identifier: string) => {
    isLoading.value.movieDetails = true

    const response = await useFetch<MovieDetails>(`https://archive.org/metadata/${identifier}`)

    if (response.error.value) {
      useMessageStore().showMessage({
        type: 'error',
        body: `Failed to fetch movie details`,
      })
      return
    }

    isLoading.value.movieDetails = false
    return response.data.value as MovieDetails
  }

  // Add a function to save a movie to Strapi
  const saveMovieToStrapi = async (movie: Movie) => {
    // Set the saving status for this movie
    savingStatus.value[movie.identifier] = 'saving'
    isLoading.value.saving = true

    // Prepare movie data for Strapi
    // const movieData: Movie = {
    // 	title: movie.title,
    // 	year: movie.date || "",
    // };

    // Use Nuxt Strapi module to save the movie
    const { create, find } = useStrapi()
    try {
      const linkData = {
        site: 'archive.org',
        identifier: movie.identifier,
      }
      const links = await find('external-links', {
        filters: {
          $and: [{ site: { $eq: 'archive.org' } }, { identifier: { $eq: movie.identifier } }],
        },
      })
      console.log('links', links)

      const link = !links.data.length
        ? (await create('external-links', linkData)).data
        : links.data[0]
      console.log('link', link)

      const year = movie.date ? new Date(movie.date).getFullYear().toString() : undefined

      const result = await create('movies', {
        title: movie.title,
        year,
        links: [link.id],
      })
      console.log('result', result)

      // Update status on success
      savingStatus.value[movie.identifier] = 'saved'
      isLoading.value.saving = false
      useMessageStore().showMessage({
        type: 'success',
        body: `Successfully saved "${movie.title}" to your collection!`,
      })

      // Return the saved movie data
      return result
    } catch (createError: any) {
      useMessageStore().showMessage({
        type: 'error',
        body: `Strapi create error: ${createError.message || 'Failed to save movie to Strapi'}`,
      })
      savingStatus.value[movie.identifier] = 'error'
      isLoading.value.saving = false
    }
  }

  /**
   * Search for movies using OMDB API directly
   * @param id - Movie ID in Strapi
   * @param query - Search query/keyword
   * @param year - Optional year of release
   * @returns Search results from OMDB
   */
  const searchImdb = async (id: number, query: string, year?: string) => {
    isLoading.value.imdbFetch = true

    // Validate API key
    const apiKey = validateOmdbApiKey()
    if (!apiKey) return null

    try {
      // Directly fetch from OMDB API
      const searchResult = await $fetch('https://www.omdbapi.com/', {
        params: {
          apikey: apiKey,
          s: query,
          ...(year ? { y: year } : {}),
        },
      })

      if (searchResult.Error) {
        useMessageStore().showMessage({
          type: 'warning',
          body: searchResult.Error,
        })
      } else {
        useMessageStore().showMessage({
          type: 'success',
          body: `Found ${searchResult.totalResults} results for "${query}" on OMDb.`,
        })
      }
      if (searchResult.totalResults === '1') {
        useStrapi().update('movies', id, {
          imdbId: searchResult.Search[0].imdbID,
        })
      }
      isLoading.value.imdbFetch = false

      // Return the result which already has the expected format:
      // { Search: [...], totalResults: "...", Response: "True" }
    } catch (error: any) {
      useMessageStore().showMessage({
        type: 'error',
        body: `OMDB search error: ${error.message || 'Failed to search movies'}`,
      })
      isLoading.value.imdbFetch = false
      return null
    }
  }

  /**
   * Get detailed information for a specific movie from OMDB API and update Strapi entry
   * @param id - Strapi ID of the movie entry to update
   * @param imdbId - IMDB ID of the movie for exact match
   * @returns Detailed movie information from OMDB
   */
  const getMovieDetails = async (id: string, imdbId: string) => {
    isLoading.value.imdbFetch = true

    // Validate API key
    const apiKey = validateOmdbApiKey()
    if (!apiKey) return null

    // Fetch movie details from OMDB API
    const movieDetails = await $fetch<OmdbMovieDetails>('https://www.omdbapi.com/', {
      params: {
        apikey: apiKey,
        i: imdbId,
        plot: 'full',
      },
    })

    if (movieDetails.Error) {
      useMessageStore().showMessage({
        type: 'warning',
        body: movieDetails.Error,
      })
      isLoading.value.imdbFetch = false
      return null
    }

    // Update the movie in Strapi

    const { update } = useStrapi()
    const updateResult = await update('movies', id, {
      title: movieDetails.Title,
      year: parseInt(movieDetails.Year) || undefined,
      imdbId: movieDetails.imdbID,
      rated: movieDetails.Rated,
      released: movieDetails.Released,
      runtime: movieDetails.Runtime,
      genre: movieDetails.Genre,
      director: movieDetails.Director,
      writer: movieDetails.Writer,
      actors: movieDetails.Actors,
      plot: movieDetails.Plot,
      language: movieDetails.Language,
      country: movieDetails.Country,
      imdbRating: parseFloat(movieDetails.imdbRating) || undefined,
      imdbVotes: parseInt(movieDetails.imdbVotes.replace(/,/g, '')) || undefined,
    })

    if (updateResult) {
      useMessageStore().showMessage({
        type: 'success',
        body: `Successfully updated "${movieDetails.Title}" with OMDB details!`,
      })
    }

    isLoading.value.imdbFetch = false
  }
  /**
   * Fetch movie images from OMDB API
   * @param id - Strapi ID of the movie entry
   * @param imdbId - IMDB ID of the movie for exact match
   * @returns Movie images data from OMDB or null if error
   */
  const getMovieImage = async (id: string, imdbId: string) => {
    isLoading.value.imdbFetch = true

    // Validate API key
    const apiKey = validateOmdbApiKey()
    if (!apiKey) return null

    try {
      // Fetch movie images from OMDB API
      const movieImage = await $fetch<Blob>(`http://img.omdbapi.com/?apikey=${apiKey}&i=${imdbId}`)

      useMessageStore().showMessage({
        type: 'success',
        body: `Successfully fetched images for movie with IMDB ID: ${imdbId}`,
      })

      isLoading.value.imdbFetch = false
      // Upload the image to Strapi using Nuxt Strapi module
      const formData = new FormData()

      // Create a file from the blob
      const file = new File([movieImage], `${imdbId}.jpg`, {
        type: 'image/jpeg',
      })
      formData.append('files', file)

      try {
        const _token = useStrapiToken()
        const client = useStrapiClient()

        const uploadResponse = await client<any[]>('/upload', {
          method: 'POST',
          body: formData,
        })

        if (uploadResponse && uploadResponse.length > 0) {
          useMessageStore().showMessage({
            type: 'success',
            body: `Successfully uploaded image for movie with IMDB ID: ${imdbId}`,
          })

          // Update the movie record with the uploaded image
          const { update } = useStrapi()
          await update('movies', id, {
            poster: uploadResponse[0].id,
          })
        }
      } catch (uploadError: any) {
        useMessageStore().showMessage({
          type: 'error',
          body: `Failed to upload image: ${uploadError.message || 'Unknown error'}`,
        })
      }
    } catch (error: any) {
      useMessageStore().showMessage({
        type: 'error',
        body: `Failed to fetch movie images: ${error.message || 'Unknown error'}`,
      })
      isLoading.value.imdbFetch = false
      return null
    }
  }

  return {
    movies,
    isLoading,
    savingStatus,
    fetchArchiveOrgMovies,
    fetchMovies,
    fetchMovieDetails,
    searchImdb,
    getMovieDetails,
    getMovieImage,
    saveMovieToStrapi,
  }
})
