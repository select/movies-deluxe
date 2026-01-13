<template>
  <MovieListPage
    title="Liked Movies"
    description="Your personal collection of favorite movies"
    title-icon="i-mdi-heart text-theme-accent"
    :movie-ids="likedMovieIds"
    :movie-count="likedCount"
    :is-loading="false"
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

// Get likedMovieIds directly from store (VueUse storage)
const { likedMovieIds, likedCount } = storeToRefs(movieStore)

// Local loading state (not currently used but kept for future enhancements)
const _isLoadingLiked = ref(false)
</script>
