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

      <!-- Sidebar -->
      <Sidebar @open-filters="isFilterMenuOpen = true" />

      <!-- Filter Menu -->
      <FilterMenu
        :is-open="isFilterMenuOpen"
        @close="isFilterMenuOpen = false"
      />

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto px-4 py-8 md:ml-20">
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
          <div class="flex flex-wrap gap-4 text-sm">
            <div class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <span class="font-semibold">Total Movies:</span> {{ movieStore.movies.length }}
            </div>
            <div class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <span class="font-semibold">Archive.org:</span> {{ archiveCount }}
            </div>
            <div class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <span class="font-semibold">YouTube:</span> {{ youtubeCount }}
            </div>
            <div class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <span class="font-semibold">With Metadata:</span> {{ enrichedCount }}
            </div>
          </div>
        </div>

        <!-- Movie Grid -->
        <div
          v-if="movieStore.movies.length > 0"
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
        >
          <div
            v-for="movie in displayedMovies"
            :key="movie.imdbId"
            class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
          >
            <!-- Poster -->
            <div class="aspect-[2/3] bg-gray-200 dark:bg-gray-700 relative">
              <!-- Use local poster only for movies with real IMDB IDs -->
              <img
                v-if="movie.imdbId.startsWith('tt')"
                :src="`/posters/${movie.imdbId}.jpg`"
                :alt="movie.title"
                class="w-full h-full object-cover"
                loading="lazy"
                @error="(e) => handlePosterError(e)"
              >
              <!-- Icon fallback for movies without local posters -->
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
              >
                <div class="i-mdi-movie text-6xl" />
              </div>
              
              <!-- Badges -->
              <div class="absolute top-2 right-2 flex flex-col gap-1 items-end">
                <!-- Source Badge -->
                <span
                  v-if="movie.sources[0]?.type === 'archive.org'"
                  class="px-2 py-1 text-xs rounded-full bg-gray-700 dark:bg-gray-600 text-white"
                >
                  Archive.org
                </span>
                <span
                  v-else-if="movie.sources[0]?.type === 'youtube'"
                  class="px-2 py-1 text-xs rounded-full bg-red-500 text-white"
                >
                  {{ movie.sources[0].channelName || 'YouTube' }}
                </span>
                
                <!-- Language Badge -->
                <span
                  v-if="getLanguageCode(movie.metadata?.Language)"
                  class="px-2 py-1 text-xs rounded-full bg-gray-800 dark:bg-gray-700 text-white font-semibold"
                >
                  {{ getLanguageCode(movie.metadata?.Language) }}
                </span>
              </div>
            </div>

            <!-- Movie Info -->
            <div class="p-4">
              <h3 class="font-semibold text-sm line-clamp-2 mb-2">
                {{ movie.title }}
              </h3>
              
              <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
                <span v-if="movie.year">{{ movie.year }}</span>
                <span v-if="movie.year && movie.metadata?.imdbRating">•</span>
                <span
                  v-if="movie.metadata?.imdbRating"
                  class="flex items-center gap-1"
                >
                  <div class="i-mdi-star text-yellow-500 dark:text-yellow-400" />
                  {{ movie.metadata.imdbRating }}
                  <span
                    v-if="movie.metadata?.imdbVotes"
                    class="text-gray-500 dark:text-gray-500"
                  >
                    ({{ formatVotes(movie.metadata.imdbVotes) }})
                  </span>
                </span>
              </div>

              <!-- Watch Button -->
              <a
                v-if="movie.sources[0]"
                :href="movie.sources[0].url"
                target="_blank"
                rel="noopener noreferrer"
                class="block w-full text-center px-3 py-2 text-sm rounded-full bg-gray-700 dark:bg-yellow-600 text-white hover:bg-gray-600 dark:hover:bg-yellow-500 transition-colors"
              >
                Watch Now
              </a>
            </div>
          </div>
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
const movieStore = useMovieStore()

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
const sortedMovies = computed(() => {
  // Sort movies: those with IMDB IDs (potential posters) first, then others
  return [...movieStore.movies].sort((a, b) => {
    const aHasImdb = a.imdbId.startsWith('tt')
    const bHasImdb = b.imdbId.startsWith('tt')
    
    if (aHasImdb && !bHasImdb) return -1
    if (!aHasImdb && bHasImdb) return 1
    return 0
  })
})

const displayedMovies = computed(() => {
  return sortedMovies.value.slice(0, currentPage.value * itemsPerPage)
})

const hasMore = computed(() => {
  return displayedMovies.value.length < sortedMovies.value.length
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

// Handle poster loading errors
const handlePosterError = (event: Event) => {
  const img = event.target as HTMLImageElement
  // Hide the image and show icon fallback
  img.style.display = 'none'
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
