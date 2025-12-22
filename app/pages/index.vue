<template>
  <div
    :class="isDark ? 'dark' : ''"
    class="min-h-screen transition-colors"
  >
    <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <!-- Header -->
      <header class="sticky top-0 z-30 glass border-b border-gray-200 dark:border-gray-800 transition-all duration-300 bg-gradient-to-r from-white/80 via-white/70 to-white/80 dark:from-gray-900/80 dark:via-gray-900/70 dark:to-gray-900/80">
        <div
          :class="[
            'max-w-none mx-auto px-4 lg:px-[6%] flex items-center justify-between transition-all duration-300',
            windowScrollY > 50 ? 'py-3' : 'py-6'
          ]"
        >
          <div>
            <h1
              :class="[
                'font-bold transition-all duration-300',
                windowScrollY > 50 ? 'text-xl' : 'text-3xl'
              ]"
            >
              Movies Deluxe
            </h1>
            <p
              v-if="windowScrollY <= 50"
              class="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-all duration-300"
            >
              Free legal movie streams from Archive.org and YouTube
            </p>
          </div>

          <!-- Search Bar -->
          <div
            :class="[
              'flex-1 max-w-md mx-8 hidden md:block transition-all duration-300',
              windowScrollY > 50 ? 'scale-95' : 'scale-100'
            ]"
          >
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
            :class="[
              'rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-300',
              windowScrollY > 50 ? 'p-1.5' : 'p-2'
            ]"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleDarkMode"
          >
            <div
              v-if="isDark"
              class="i-material-symbols-light-wb-sunny text-xl text-yellow-500"
            />
            <div
              v-else
              class="i-material-symbols-light-dark-mode text-xl"
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
              <span class="text-gray-500">Total Movies:</span> {{ filteredAndSortedMovies.length }}
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
import { useMagicKeys, whenever, useWindowScroll } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'

const movieStore = useMovieStore()
const filterStore = useFilterStore()
const { y: windowScrollY } = useWindowScroll()

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

  // Restore scroll position after a short delay to ensure DOM is rendered
  if (filterStore.filters.lastScrollY > 0) {
    setTimeout(() => {
      window.scrollTo({
        top: filterStore.filters.lastScrollY,
        behavior: 'instant'
      })
    }, 100)
  }
})

// Save scroll position before leaving
onBeforeRouteLeave(() => {
  filterStore.setScrollY(windowScrollY.value)
})

// Clean up observer on unmount
onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})

// Reset pagination when filters change (excluding currentPage itself)
watch(
  () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { currentPage, lastScrollY, ...rest } = filterStore.filters
    return JSON.stringify(rest)
  },
  () => {
    filterStore.setCurrentPage(1)
    filterStore.setScrollY(0)
  }
)

// Keyboard shortcuts
const keys = useMagicKeys()
const { Escape, k } = keys

// Escape key closes filter menu
if (Escape) {
  whenever(Escape, () => {
    if (isFilterMenuOpen.value) {
      isFilterMenuOpen.value = false
    }
  })
}

// 'K' key toggles filter menu (only when not typing in input)
if (k) {
  whenever(k, () => {
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
  return filteredAndSortedMovies.value.slice(0, filterStore.filters.currentPage * itemsPerPage)
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
  filterStore.setCurrentPage(filterStore.filters.currentPage + 1)
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
