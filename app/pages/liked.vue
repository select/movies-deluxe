<template>
  <MovieListPage
    title="Liked Movies"
    description="Your personal collection of favorite movies"
    title-icon="i-mdi-heart text-theme-accent"
    :movies="likedMoviesData"
    :movie-count="likedCount"
    :is-loading="isLoadingLiked"
    search-placeholder="Search liked movies..."
    empty-state-icon="i-mdi-heart-outline"
    empty-state-title="No liked movies yet"
    empty-state-description="Start exploring movies and click the heart icon to add them to your favorites"
    empty-state-button-to="/"
    empty-state-button-text="Browse Movies"
    empty-state-button-icon="i-mdi-magnify"
  />
</template>

<script setup lang="ts">
// Set page title and meta
useHead({
  title: 'Liked Movies - Movies Deluxe',
  meta: [
    {
      name: 'description',
      content: 'Your personal collection of favorite movies from Movies Deluxe.',
    },
    { property: 'og:title', content: 'Liked Movies - Movies Deluxe' },
    {
      property: 'og:description',
      content: 'Your personal collection of favorite movies from Movies Deluxe.',
    },
  ],
})

const movieStore = useMovieStore()
const { loadFromFile, fetchMoviesByIds } = movieStore

// Get likedMovieIds directly from store (VueUse storage)
const { likedMovieIds, likedCount } = storeToRefs(movieStore)

// Local state for liked movies (since store uses lazy loading)
const likedMoviesData = ref<MovieEntry[]>([])
const isLoadingLiked = ref(true)

// Initialize database and load liked movies
onMounted(async () => {
  try {
    // Initialize database if not already loaded
    await loadFromFile()

    // Fetch full movie details for liked IDs from VueUse storage
    if (likedMovieIds.value.length > 0) {
      // Convert readonly array to mutable array for fetchMoviesByIds
      likedMoviesData.value = await fetchMoviesByIds([...likedMovieIds.value])
    }
  } catch {
    // Failed to load liked movies, continue with empty state
  } finally {
    isLoadingLiked.value = false
  }
})
</script>
