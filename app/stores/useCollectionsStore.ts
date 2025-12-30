import { defineStore } from 'pinia'

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
    if (existing && (existing as any).movies) {
      return existing as Collection & { movies: any[] }
    }

    try {
      const data = await $fetch<Collection & { movies: any[] }>(`/api/collections/${id}`)
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

  const getCollectionsForMovie = (movieId: string) => {
    return Array.from(collections.value.values()).filter(c => c.movieIds.includes(movieId))
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
