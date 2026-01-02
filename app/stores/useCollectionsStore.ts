export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Map<string, Collection>>(new Map())
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const loadCollections = async () => {
    isLoading.value = true
    error.value = null
    try {
      const data = await $fetch<Collection[]>('/api/collections')
      collections.value.clear()
      data.forEach(collection => {
        collections.value.set(collection.id, collection)
      })
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to load collections'
    } finally {
      isLoading.value = false
    }
  }

  const getCollectionById = async (id: string) => {
    // Check if we already have it with movies
    const existing = collections.value.get(id)
    if (existing && 'movies' in existing) {
      return existing as Collection & { movies: MovieEntry[] }
    }

    try {
      const data = await $fetch<Collection & { movies: MovieEntry[] }>(`/api/collections/${id}`)
      collections.value.set(id, data)
      return data
    } catch {
      return null
    }
  }

  const addMovieToCollection = async (collectionId: string, movieId: string) => {
    try {
      const response = await $fetch<{ success: boolean }>('/api/admin/collections/add-movie', {
        method: 'POST',
        body: { collectionId, movieId },
      })
      if (response.success) {
        const collection = collections.value.get(collectionId)
        if (collection && !collection.movieIds.includes(movieId)) {
          collection.movieIds.push(movieId)
          collection.updatedAt = new Date().toISOString()
        }
      }
      return response.success
    } catch {
      return false
    }
  }

  const removeMovieFromCollection = async (collectionId: string, movieId: string) => {
    try {
      const response = await $fetch<{ success: boolean }>('/api/admin/collections/remove-movie', {
        method: 'POST',
        body: { collectionId, movieId },
      })
      if (response.success) {
        const collection = collections.value.get(collectionId)
        if (collection) {
          const index = collection.movieIds.indexOf(movieId)
          if (index !== -1) {
            collection.movieIds.splice(index, 1)
            collection.updatedAt = new Date().toISOString()
          }
        }
      }
      return response.success
    } catch {
      return false
    }
  }

  const isMovieInCollection = (movieId: string, collectionId: string) => {
    const collection = collections.value.get(collectionId)
    return collection ? collection.movieIds.includes(movieId) : false
  }

  const getCollectionsForMovie = async (movieId: string): Promise<Collection[]> => {
    try {
      const db = useDatabase()
      return await db.getCollectionsForMovie(movieId)
    } catch (error) {
      console.error('Failed to get collections for movie:', error)
      return []
    }
  }

  return {
    collections,
    isLoading,
    error,
    loadCollections,
    getCollectionById,
    addMovieToCollection,
    removeMovieFromCollection,
    isMovieInCollection,
    getCollectionsForMovie,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCollectionsStore, import.meta.hot))
}
