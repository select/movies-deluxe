<template>
  <div
    :class="isDark ? 'dark' : ''"
    class="min-h-screen transition-colors"
  >
    <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <!-- Header -->
      <header class="border-b border-gray-200 dark:border-gray-800">
        <div class="max-w-none mx-auto px-4 lg:px-[6%] py-6 flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold">
              Movies Deluxe
            </h1>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Free legal movie streams from Archive.org and YouTube
            </p>
          </div>

          <!-- Search Bar -->
          <div class="flex-1 max-w-md mx-8 hidden md:block">
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div class="i-mdi-magnify text-gray-400" />
              </div>
              <input
                :value="filterStore.filters.searchQuery"
                type="text"
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-full leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
                placeholder="Search movies, actors, directors..."
                @input="(e) => handleSearchInput((e.target as HTMLInputElement).value)"
              >
              <button
                v-if="filterStore.filters.searchQuery"
                class="absolute inset-y-0 right-0 pr-3 flex items-center"
                @click="filterStore.setSearchQuery('')"
              >
                <div class="i-mdi-close text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
              </button>
            </div>
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

      <!-- Mobile Search Bar -->
      <div class="md:hidden px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div class="i-mdi-magnify text-gray-400" />
          </div>
          <input
            :value="filterStore.filters.searchQuery"
            type="text"
            class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-full leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
            placeholder="Search movies, actors..."
            @input="(e) => handleSearchInput((e.target as HTMLInputElement).value)"
          >
          <button
            v-if="filterStore.filters.searchQuery"
            class="absolute inset-y-0 right-0 pr-3 flex items-center"
            @click="filterStore.setSearchQuery('')"
          >
            <div class="i-mdi-close text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
          </button>
        </div>
      </div>

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
      <main class="max-w-none mx-auto px-4 lg:px-[6%] py-8 md:ml-16">
        <!-- Loading State -->
        <div
          v-if="movieStore.isInitialLoading"
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          <MovieCardSkeleton
            v-for="i in 12"
            :key="i"
          />
        </div>

        <!-- Movie Stats -->
        <div
          v-else-if="movieStore.movies.length > 0"
          class="mb-8"
        >
          <div class="flex flex-wrap gap-6 text-sm">
            <div class="">
              <span class="text-gray-500">Total Movies:</span> {{ movieStore.movies.length }}
            </div>
            <div class="">
              <span class="text-gray-500">Archive.org:</span> {{ archiveCount }}
            </div>
            <div class="">
              <span class="text-gray-500">YouTube:</span> {{ youtubeCount }}
            </div>
            <div class="">
              <span class="text-gray-500">With Metadata:</span> {{ enrichedCount }}
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
          v-else-if="!movieStore.isInitialLoading"
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
        <div class="max-w-none mx-auto px-4 lg:px-[6%] py-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>All movies are legally available from Archive.org and YouTube</p>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMovieStore } from '@/stores/useMovieStore'
import { useFilterStore } from '@/stores/useFilterStore'
import { useMagicKeys, whenever } from '@vueuse/core'

const movieStore = useMovieStore()
const filterStore = useFilterStore()

// Search handling
const handleSearchInput = (query: string) => {
  filterStore.setSearchQuery(query)
  
  // If searching, switch to relevance sort if not already
  if (query && filterStore.filters.sort.field !== 'relevance') {
    filterStore.setSort({ field: 'relevance', direction: 'desc', label: 'Relevance' })
  }
}

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

// Reset pagination when filters change
watch(
  () => filterStore.filters,
  () => {
    currentPage.value = 1
  },
  { deep: true }
)

// Keyboard shortcuts
const keys = useMagicKeys()
const { Escape, f } = keys

// Escape key closes filter menu
if (Escape) {
  whenever(Escape, () => {
    if (isFilterMenuOpen.value) {
      isFilterMenuOpen.value = false
    }
  })
}

// 'F' key toggles filter menu (only when not typing in input)
if (f) {
  whenever(f, () => {
    // Check if user is typing in an input/textarea
    if (typeof window !== 'undefined') {
      const activeElement = window.document.activeElement
      const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

      if (!isTyping) {
        isFilterMenuOpen.value = !isFilterMenuOpen.value
      }
    }
  })
}

// Toggle dark mode
const toggleDarkMode = () => {
  isDark.value = !isDark.value
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }
}

// Computed properties
const filteredAndSortedMovies = computed(() => {
  // 1. Apply search first (using Fuse.js in movieStore)
  const searchedMovies = movieStore.searchMovies(filterStore.filters.searchQuery)
  
  // 2. Apply other filters and sorting
  return filterStore.applyFilters(searchedMovies)
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
      if (entry && entry.isIntersecting && hasMore.value) {
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
