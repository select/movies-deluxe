import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export const useLikedMoviesStore = defineStore('likedMovies', () => {
  // State persisted to localStorage
  const likedMovies = useStorage<string[]>('movies-deluxe-liked', [])

  /**
   * Check if a movie is liked
   * @param imdbId - IMDB ID of the movie
   * @returns boolean indicating if movie is liked
   */
  const isLiked = (imdbId: string): boolean => {
    return likedMovies.value.includes(imdbId)
  }

  /**
   * Add a movie to liked movies
   * @param imdbId - IMDB ID of the movie to like
   */
  const like = (imdbId: string) => {
    if (!likedMovies.value.includes(imdbId)) {
      likedMovies.value.push(imdbId)
    }
  }

  /**
   * Remove a movie from liked movies
   * @param imdbId - IMDB ID of the movie to unlike
   */
  const unlike = (imdbId: string) => {
    const index = likedMovies.value.indexOf(imdbId)
    if (index !== -1) {
      likedMovies.value.splice(index, 1)
    }
  }

  /**
   * Toggle a movie's liked status
   * @param imdbId - IMDB ID of the movie to toggle
   */
  const toggle = (imdbId: string) => {
    if (isLiked(imdbId)) {
      unlike(imdbId)
    } else {
      like(imdbId)
    }
  }

  /**
   * Clear all liked movies
   */
  const clear = () => {
    likedMovies.value = []
  }

  /**
   * Get the count of liked movies
   */
  const count = computed(() => likedMovies.value.length)

  return {
    // State
    likedMovies,
    count,

    // Actions
    isLiked,
    like,
    unlike,
    toggle,
    clear,
  }
})
