<template>
  <div
    :class="isDark ? 'dark' : ''"
    class="min-h-screen transition-colors"
  >
    <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <!-- Header -->
      <header class="border-b border-gray-200 dark:border-gray-800">
        <div class="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold">
              Movies Deluxe
            </h1>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Free legal movie streams from Archive.org and YouTube
            </p>
          </div>

          <!-- Dark Mode Toggle -->
          <button
            class="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleDarkMode"
          >
            <div
              v-if="isDark"
              class="i-mdi-weather-sunny text-xl text-yellow-500"
            />
            <div
              v-else
              class="i-mdi-weather-night text-xl"
            />
          </button>
        </div>
      </header>

      <!-- Mobile Menu Button -->
      <MobileMenuButton @open-filters="isFilterMenuOpen = true" />

      <!-- Desktop Sidebar -->
      <Sidebar @open-filters="isFilterMenuOpen = true" />

      <!-- Filter Menu -->
      <FilterMenu
        :is-open="isFilterMenuOpen"
        @close="isFilterMenuOpen = false"
      />

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto px-4 py-8 md:ml-16">
        <!-- Loading State -->
        <div
          v-if="movieStore.isLoading.movies"
          class="text-center py-12"
        >
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100" />
          <p class="mt-4 text-gray-600 dark:text-gray-400">
            Loading movies...
          </p>
        </div>

        <!-- Movie Stats -->
        <div
          v-else-if="movieStore.movies.length > 0"
          class="mb-8"
        >
          <div class="flex flex-wrap gap-3 text-sm">
            <div class="px-3 py-1 rounded-full">
              <span class="font-semibold">Total Movies:</span> {{ movieStore.movies.length }}
            </div>
            <div class="px-3 py-1 rounded-full">
              <span class="font-semibold">Archive.org:</span> {{ archiveCount }}
            </div>
            <div class="px-3 py-1 rounded-full">
              <span class="font-semibold">YouTube:</span> {{ youtubeCount }}
            </div>
            <div class="px-3 py-1 rounded-full">
              <span class="font-semibold">With Metadata:</span> {{ enrichedCount }}
            </div>
          </div>
        </div>

        <!-- Movie Grid -->
        <div
          v-if="movieStore.movies.length > 0"
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          <MovieCard
            v-for="movie in displayedMovies"
            :key="movie.imdbId"
            :movie="movie"
          />
        </div>

        <!-- Empty State -->
        <div
          v-else-if="!movieStore.isLoading.movies"
          class="text-center py-12"
        >
          <p class="text-gray-600 dark:text-gray-400">
            No movies found.
          </p>
        </div>

        <!-- Infinite Scroll Sentinel -->
        <div
          v-if="hasMore"
          ref="sentinelRef"
          class="text-center mt-8 py-4"
        >
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Loading more movies...
          </p>
        </div>

        <!-- End of List Message -->
        <div
          v-else-if="movieStore.movies.length > 0"
          class="text-center mt-8 py-4 text-sm text-gray-600 dark:text-gray-400"
        >
          You've reached the end of the list
        </div>
      </main>

      <!-- Footer -->
      <footer class="border-t border-gray-200 dark:border-gray-800 mt-12">
        <div class="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>All movies are legally available from Archive.org and YouTube</p>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMovieStore } from '@/stores/useMovieStore'
import { useFilterStore } from '@/stores/useFilterStore'

const movieStore = useMovieStore()
const filterStore = useFilterStore()

// Dark mode state (default to dark)
const isDark = ref(true)

// Filter menu state
const isFilterMenuOpen = ref(false)

// Pagination
const itemsPerPage = 20
const currentPage = ref(1)

// Infinite scroll sentinel ref
const sentinelRef = ref<HTMLElement | null>(null)

// Load movies on mount
onMounted(async () => {
  await movieStore.loadFromFile()

  // Check for saved dark mode preference, default to dark
  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('theme')
    isDark.value = savedTheme ? savedTheme === 'dark' : true
  }

  // Set up intersection observer for infinite scroll
  setupInfiniteScroll()
})

// Clean up observer on unmount
onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})

// Toggle dark mode
const toggleDarkMode = () => {
  isDark.value = !isDark.value
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }
}

// Computed properties
const filteredAndSortedMovies = computed(() => {
  // Apply all filters and sorting from the filter store
  return filterStore.applyFilters(movieStore.movies)
})

const displayedMovies = computed(() => {
  return filteredAndSortedMovies.value.slice(0, currentPage.value * itemsPerPage)
})

const hasMore = computed(() => {
  return displayedMovies.value.length < filteredAndSortedMovies.value.length
})

const archiveCount = computed(() => {
  return movieStore.filterBySource('archive.org').length
})

const youtubeCount = computed(() => {
  return movieStore.filterBySource('youtube').length
})

const enrichedCount = computed(() => {
  return movieStore.getEnrichedMovies().length
})

// Intersection observer for infinite scroll
let observer: IntersectionObserver | null = null

const setupInfiniteScroll = () => {
  if (typeof window === 'undefined') return

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      // Load more when sentinel is visible and there are more items
      if (entry.isIntersecting && hasMore.value) {
        loadMore()
      }
    },
    {
      // Trigger when sentinel is 200px from viewport
      rootMargin: '200px',
      threshold: 0,
    }
  )

  // Watch the sentinel element
  watch(sentinelRef, (newSentinel) => {
    if (observer && newSentinel) {
      observer.observe(newSentinel)
    }
  }, { immediate: true })
}

// Load more movies
const loadMore = () => {
  currentPage.value++
}
</script>

<style scoped>
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
