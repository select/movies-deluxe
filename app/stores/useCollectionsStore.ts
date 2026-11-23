import { defineStore, acceptHMRUpdate } from '#imports'
import { ref } from 'vue'
import type { Collection, SavedQuery } from '#shared/types/collections'
import { $fetch } from '#build/fetch'

export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Map<string, Collection>>(new Map())
  const movieToCollectionsMap = new Map<string, Collection[]>()
  const isLoading = ref(false)
  const isLoaded = ref(false) // Track if collections have been loaded
  const error = ref<string | null>(null)
  let loadingPromise: Promise<void> | null = null

  /**
   * Load all collections from JSON file once and cache them
   * Subsequent calls will use the cached data unless force=true
   */
  const loadCollections = async (force = false): Promise<void> => {
    // Return early if already loaded and not forcing a refresh
    if (!force && isLoaded.value) {
      return
    }

    // Deduplicate concurrent fetches, or wait for in-flight fetch before forcing refresh
    while (loadingPromise) {
      if (!force) {
        return loadingPromise
      }
      await loadingPromise.catch(() => {})
    }

    loadingPromise = (async () => {
      isLoading.value = true
      error.value = null
      try {
        // Fetch directly from static JSON file
        const data =
          await $fetch<Record<string, Collection | { version: string }>>('/data/collections.json')
        collections.value.clear()
        movieToCollectionsMap.clear()

        // Filter out schema keys and convert to array
        const collectionsArray = Object.entries(data)
          .filter(([key]) => !key.startsWith('_'))
          .map(([_, value]) => value as Collection)

        collectionsArray.forEach(collection => {
          collections.value.set(collection.id, collection)
          for (const movieId of collection.movieIds) {
            const existing = movieToCollectionsMap.get(movieId)
            if (existing) {
              existing.push(collection)
            } else {
              movieToCollectionsMap.set(movieId, [collection])
            }
          }
        })

        isLoaded.value = true
      } catch (err: unknown) {
        error.value = (err as Error).message || 'Failed to load collections'
      } finally {
        isLoading.value = false
        loadingPromise = null
      }
    })()

    return loadingPromise
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
        // Force reload collections from server to get latest data
        await loadCollections(true)
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
        // Force reload collections from server to get latest data
        await loadCollections(true)
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

  const addQueryToCollection = async (collectionId: string, query: SavedQuery) => {
    try {
      const response = await $fetch<{ success: boolean }>(
        '/api/admin/collections/update-collection',
        {
          method: 'POST',
          body: {
            collectionId,
            updates: {
              queries: { action: 'add', query },
            },
          },
        }
      )
      if (response.success) {
        await loadCollections(true)
      }
      return response.success
    } catch {
      return false
    }
  }

  const removeQueryFromCollection = async (collectionId: string, queryIndex: number) => {
    try {
      const response = await $fetch<{ success: boolean }>(
        '/api/admin/collections/update-collection',
        {
          method: 'POST',
          body: {
            collectionId,
            updates: {
              queries: { action: 'remove', index: queryIndex },
            },
          },
        }
      )
      if (response.success) {
        await loadCollections(true)
      }
      return response.success
    } catch {
      return false
    }
  }

  const updateCollectionTags = async (collectionId: string, tags: string[]) => {
    try {
      const response = await $fetch<{ success: boolean }>(
        '/api/admin/collections/update-collection',
        {
          method: 'POST',
          body: {
            collectionId,
            updates: {
              tags: { action: 'set', values: tags },
            },
          },
        }
      )
      if (response.success) {
        await loadCollections(true)
      }
      return response.success
    } catch {
      return false
    }
  }

  const removeMoviesFromCollection = async (collectionId: string, movieIds: string[]) => {
    try {
      const response = await $fetch<{ success: boolean }>(
        '/api/admin/collections/update-collection',
        {
          method: 'POST',
          body: {
            collectionId,
            updates: {
              movies: { action: 'remove', movieIds },
            },
          },
        }
      )
      if (response.success) {
        await loadCollections(true)
      }
      return response.success
    } catch {
      return false
    }
  }

  const reorderCollections = async (collectionIds: string[]) => {
    try {
      const response = await $fetch<{ success: boolean }>('/api/admin/collections/reorder', {
        method: 'POST',
        body: { collectionIds },
      })
      if (response.success) {
        await loadCollections(true)
      }
      return response.success
    } catch {
      return false
    }
  }

  /**
   * Get all collections that contain a specific movie
   * Uses the prebuilt movieToCollectionsMap for O(1) lookup with zero SQLite round-trips
   */
  const getCollectionsForMovie = async (movieId: string): Promise<Collection[]> => {
    try {
      if (!isLoaded.value || loadingPromise) {
        await loadCollections()
      }
      return [...(movieToCollectionsMap.get(movieId) || [])]
    } catch {
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
    addQueryToCollection,
    removeQueryFromCollection,
    updateCollectionTags,
    removeMoviesFromCollection,
    reorderCollections,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCollectionsStore, import.meta.hot))
}
