export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Map<string, Collection>>(new Map())
  const isLoading = ref(false)
  const isLoaded = ref(false) // Track if collections have been loaded
  const error = ref<string | null>(null)

  /**
   * Load all collections from JSON file once and cache them
   * Subsequent calls will use the cached data
   */
  const loadCollections = async () => {
    // Return early if already loaded
    if (isLoaded.value) {
      console.log('[CollectionsStore] Already loaded, skipping')
      return
    }

    isLoading.value = true
    error.value = null
    try {
      // Fetch directly from static JSON file
      console.log('[CollectionsStore] Fetching collections from /data/collections.json')
      const data =
        await $fetch<Record<string, Collection | { version: string }>>('/data/collections.json')
      collections.value.clear()

      // Filter out schema keys and convert to array
      const collectionsArray = Object.entries(data)
        .filter(([key]) => !key.startsWith('_'))
        .map(([_, value]) => value as Collection)

      console.log('[CollectionsStore] Loaded', collectionsArray.length, 'collections')
      collectionsArray.forEach(collection => {
        collections.value.set(collection.id, collection)
      })

      isLoaded.value = true
    } catch (err: unknown) {
      console.error('[CollectionsStore] Failed to load collections:', err)
      error.value = (err as Error).message || 'Failed to load collections'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get a collection by ID from cache
   * Loads collections if not loaded yet
   */
  const getCollectionById = async (id: string): Promise<Collection | null> => {
    // Load collections if not loaded yet
    if (!isLoaded.value) {
      await loadCollections()
    }

    // Return from cache
    return collections.value.get(id) || null
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

  /**
   * Get all collections that contain a specific movie
   * Queries the database to find which collections include this movie
   */
  const getCollectionsForMovie = async (movieId: string): Promise<Collection[]> => {
    try {
      // Use database only if it's already initialized (e.g., from index page)
      // This avoids loading the database just for collections on detail pages
      const db = useDatabase()

      // If database is not ready, fall back to checking loaded collections
      // This prevents loading the entire SQLite DB just for collections
      if (!db.isReady.value) {
        // Ensure collections are loaded
        if (!isLoaded.value) {
          await loadCollections()
        }
        // Check in-memory collections store
        return Array.from(collections.value.values()).filter(c => c.movieIds.includes(movieId))
      }

      return await db.getCollectionsForMovie(movieId)
    } catch (error) {
      console.error('Failed to get collections for movie:', error)
      return []
    }
  }

  return {
    collections,
    isLoading,
    isLoaded,
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
