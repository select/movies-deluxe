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

        <template v-else-if="currentMovieList.length > 0">
          <MovieVirtualGrid
            :movies="currentMovieList"
            :total-movies="safeTotalMovies"
            @load-more="loadMore"
          />
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
const {
  isInitialLoading,
  isFiltering,
  currentMovieList,
  totalFiltered,
  filters,
  lightweightMovies,
} = storeToRefs(movieStore)
const { loadFromFile, setCurrentPage } = movieStore

const safeTotalMovies = computed(() => totalFiltered.value || 0)

// Load movies on mount
onMounted(async () => {
  await loadFromFile()

  // If no movies are loaded yet, trigger initial fetch
  if (lightweightMovies.value.length === 0) {
    movieStore.fetchLightweightMovies({ limit: 50 })
  }
})

// Load more movies
const loadMore = () => {
  setCurrentPage(filters.value.currentPage + 1)
}
</script>

<style scoped>
/* No extra styles needed for now */
</style>
