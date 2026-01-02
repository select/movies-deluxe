<template>
  <!-- Main Content -->
  <main class="md:ml-16">
      <div class="px-4 lg:px-[6%] py-8">
        <!-- Page Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold mb-2 flex items-center gap-3 text-theme-text">
            <div class="i-mdi-heart text-theme-accent" />
            Liked Movies
          </h1>
          <p class="text-theme-textmuted">
            Your personal collection of favorite movies
            <span v-if="likedCount > 0" class="ml-2">
              ({{ likedCount }} {{ likedCount === 1 ? 'movie' : 'movies' }})
            </span>
          </p>
        </div>

        <!-- Empty State -->
        <div v-if="likedCount === 0" class="text-center py-16">
          <div class="i-mdi-heart-outline text-6xl text-theme-border mb-4" />
          <h2 class="text-xl font-semibold mb-2 text-theme-text">No liked movies yet</h2>
          <p class="text-theme-textmuted mb-6">
            Start exploring movies and click the heart icon to add them to your favorites
          </p>
          <NuxtLink
            to="/"
            class="btn-primary inline-flex items-center gap-2"
          >
            <div class="i-mdi-magnify" />
            Browse Movies
          </NuxtLink>
        </div>

        <!-- Movies Grid -->
        <template v-else-if="filteredLikedMovies.length > 0">
          <MovieStats
            v-if="!isLoadingLiked"
            :total-movies="likedCount"
            :filtered-movies="filteredLikedMovies.length"
          />

          <div class="relative">
            <template v-if="isLoadingLiked">
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <MovieCardSkeleton
                  v-for="i in 12"
                  :key="i"
                />
              </div>
            </template>

            <template v-else>
              <MovieGrid :movies="filteredLikedMovies" />
            </template>
          </div>
        </template>

        <!-- No Results After Filtering -->
        <div v-else-if="likedCount > 0 && filteredLikedMovies.length === 0" class="text-center py-12">
          <div class="i-mdi-filter-remove text-4xl text-theme-border mb-4" />
          <h2 class="text-xl font-semibold mb-2 text-theme-text">No movies match your filters</h2>
          <p class="text-theme-textmuted mb-6">
            Try adjusting your search or filter criteria
          </p>
          <button
            class="btn-primary"
            @click="resetFilters"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </main>
</template>

<script setup lang="ts">
import type { ExtendedMovieEntry } from '~/stores/useMovieStore'

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
const { loadFromFile, fetchMoviesByIds, resetFilters, applyFilters } = movieStore

// Get likedMovieIds directly from store (VueUse storage)
const { likedMovieIds, likedCount } = storeToRefs(movieStore)

// Local state for liked movies (since store uses lazy loading)
const likedMoviesData = ref<ExtendedMovieEntry[]>([])
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


// Filtered liked movies - apply current filters to liked movies
const filteredLikedMovies = computed(() => {
  return applyFilters(likedMoviesData.value)
})
</script>
