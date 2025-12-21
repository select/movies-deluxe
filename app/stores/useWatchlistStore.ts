import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export const useWatchlistStore = defineStore('watchlist', () => {
  // State persisted to localStorage
  const watchlist = useStorage<string[]>('movies-watchlist', [])

  /**
   * Check if a movie is in the watchlist
   * @param imdbId - IMDB ID of the movie
   * @returns boolean indicating if movie is in watchlist
   */
  const isInWatchlist = (imdbId: string): boolean => {
    return watchlist.value.includes(imdbId)
  }

  /**
   * Add a movie to the watchlist
   * @param imdbId - IMDB ID of the movie to add
   */
  const add = (imdbId: string) => {
    if (!watchlist.value.includes(imdbId)) {
      watchlist.value.push(imdbId)
    }
  }

  /**
   * Remove a movie from the watchlist
   * @param imdbId - IMDB ID of the movie to remove
   */
  const remove = (imdbId: string) => {
    const index = watchlist.value.indexOf(imdbId)
    if (index !== -1) {
      watchlist.value.splice(index, 1)
    }
  }

  /**
   * Toggle a movie in the watchlist
   * @param imdbId - IMDB ID of the movie to toggle
   */
  const toggle = (imdbId: string) => {
    if (isInWatchlist(imdbId)) {
      remove(imdbId)
    } else {
      add(imdbId)
    }
  }

  /**
   * Clear the entire watchlist
   */
  const clear = () => {
    watchlist.value = []
  }

  /**
   * Get the count of movies in the watchlist
   */
  const count = computed(() => watchlist.value.length)

  return {
    // State
    watchlist,
    count,

    // Actions
    isInWatchlist,
    add,
    remove,
    toggle,
    clear,
  }
})
