<template>
  <div class="min-h-screen bg-theme-background">
    <!-- Refactored Search Header -->
    <SearchHeader />

    <!-- Main Content -->
    <main class="md:ml-16 md:pt-16">
      <div class="px-4 lg:px-[6%] py-8">
        <MovieStats
          v-if="!isInitialLoading && safeTotalMovies > 0"
          :total-movies="safeTotalMovies"
        />
      </div>

      <div class="relative lg:px-[6%] px-4">
        <template v-if="isInitialLoading || isFiltering">
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          >
            <MovieCardSkeleton v-for="i in 12" :key="i" />
          </div>
        </template>

        <template v-else-if="movieIds.length > 0">
          <MovieVirtualGrid :movie-ids="movieIds" />
        </template>

        <div v-else class="text-center py-12">
          <p class="text-theme-textmuted">No movies found.</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Set page title and meta
useHead({
  title: 'Search Movies - Movies Deluxe',
  meta: [
    {
      name: 'description',
      content:
        'Search and filter thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more.',
    },
    { property: 'og:title', content: 'Search Movies - Movies Deluxe' },
    { property: 'og:type', content: 'website' },
  ],
})

const movieStore = useMovieStore()
const { isInitialLoading, isFiltering, totalFiltered, searchResultMovies } = storeToRefs(movieStore)
const { loadFromFile } = movieStore

const safeTotalMovies = computed(() => totalFiltered.value || 0)

// Extract movie IDs from lightweight movies for the virtual grid
const movieIds = computed(() => {
  return searchResultMovies.value
    .filter((movie): movie is NonNullable<typeof movie> => movie !== null)
    .map(movie => movie.imdbId)
})

// Load movies on mount - MovieVirtualGrid will handle the actual movie loading
onMounted(async () => {
  await loadFromFile()
  // MovieVirtualGrid will handle loading movies based on filters
})
</script>

<style scoped>
/* No extra styles needed for now */
</style>
