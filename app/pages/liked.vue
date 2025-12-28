<template>
  <!-- Main Content -->
  <main class="md:ml-16">
      <div class="px-4 lg:px-[6%] py-8">
        <!-- Page Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold mb-2 flex items-center gap-3">
            <div class="i-mdi-heart text-red-500" />
            Liked Movies
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            Your personal collection of favorite movies
            <span v-if="likedCount > 0" class="ml-2">
              ({{ likedCount }} {{ likedCount === 1 ? 'movie' : 'movies' }})
            </span>
          </p>
        </div>

        <!-- Empty State -->
        <div v-if="likedCount === 0" class="text-center py-16">
          <div class="i-mdi-heart-outline text-6xl text-gray-300 dark:text-gray-600 mb-4" />
          <h2 class="text-xl font-semibold mb-2">No liked movies yet</h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Start exploring movies and click the heart icon to add them to your favorites
          </p>
          <NuxtLink
            to="/"
            class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <div class="i-mdi-magnify" />
            Browse Movies
          </NuxtLink>
        </div>

        <!-- Movies Grid -->
        <template v-else-if="filteredLikedMovies.length > 0 || movieStore.hasActiveFilters">
          <MovieStats
            v-if="!isLoadingLiked && !movieStore.hasActiveFilters"
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
          <div class="i-mdi-filter-remove text-4xl text-gray-300 dark:text-gray-600 mb-4" />
          <h2 class="text-xl font-semibold mb-2">No movies match your filters</h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Try adjusting your search or filter criteria
          </p>
          <button
            class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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

// Local state for liked movies (since store uses lazy loading)
const likedMoviesData = ref<ExtendedMovieEntry[]>([])
const isLoadingLiked = ref(true)

// Initialize database and load liked movies
onMounted(async () => {
  try {
    // Initialize database if not already loaded
    await movieStore.loadFromFile()
    
    // Get liked movie IDs from localStorage
    const stored = localStorage.getItem('movies-deluxe-liked')
    if (stored) {
      const likedIds: string[] = JSON.parse(stored)
      if (likedIds.length > 0) {
        // Fetch full movie details for liked IDs
        likedMoviesData.value = await movieStore.fetchMoviesByIds(likedIds)
      }
    }
  } catch (err) {
    console.error('[liked.vue] Failed to load liked movies:', err)
  } finally {
    isLoadingLiked.value = false
  }
})

// Get liked movies count from local data
const likedCount = computed(() => likedMoviesData.value.length)

// Filtered liked movies - apply current filters to liked movies
const filteredLikedMovies = computed(() => {
  const liked = likedMoviesData.value
  if (liked.length === 0) return []
  
  // Apply filters manually since we're showing a subset (liked movies only)
  let filtered = liked
  
  // Apply search query
  const searchQuery = movieStore.filters.searchQuery?.toLowerCase().trim()
  if (searchQuery) {
    filtered = filtered.filter(movie => 
      movie.title.toLowerCase().includes(searchQuery) ||
      movie.description?.toLowerCase().includes(searchQuery)
    )
  }
  
  // Apply genre filter
  if (movieStore.filters.genres && movieStore.filters.genres.length > 0) {
    filtered = filtered.filter(movie => 
      movie.genres?.some(genre => movieStore.filters.genres?.includes(genre))
    )
  }
  
  // Apply year range filter
  if (movieStore.filters.yearRange) {
    const { min, max } = movieStore.filters.yearRange
    filtered = filtered.filter(movie => {
      const year = movie.year
      return year >= min && year <= max
    })
  }
  
  // Apply rating filter
  if (movieStore.filters.ratingRange) {
    const { min, max } = movieStore.filters.ratingRange
    filtered = filtered.filter(movie => {
      const rating = movie.rating || 0
      return rating >= min && rating <= max
    })
  }
  
  // Apply source filter
  if (movieStore.filters.sources && movieStore.filters.sources.length > 0) {
    filtered = filtered.filter(movie => 
      movie.sources?.some(source => 
        // Check both label (for Archive.org) and channelName (for YouTube)
        movieStore.filters.sources?.includes(source.label || source.channelName || '')
      )
    )
  }
  
  return filtered
})

// Reset filters
const resetFilters = () => {
  movieStore.clearAllFilters()
}
</script>