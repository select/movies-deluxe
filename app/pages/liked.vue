<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
    <!-- Header -->
    <MovieHeader />

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
        <template v-else-if="filteredLikedMovies.length > 0 || isFiltering">
          <MovieStats
            v-if="!movieStore.isInitialLoading && !isFiltering"
            :total-movies="likedCount"
            :filtered-movies="filteredLikedMovies.length"
          />
          
          <div class="relative">
            <template v-if="movieStore.isInitialLoading || isFiltering">
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
        <div v-else-if="likedCount > 0 && filteredLikedMovies.length === 0 && !isFiltering" class="text-center py-12">
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
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMagicKeys, whenever, onKeyStroke } from '@vueuse/core'
import type { MovieEntry } from '~/types'

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
const filterStore = useFilterStore()
const likedMoviesStore = useLikedMoviesStore()
const { likedMovies, count: likedCount } = storeToRefs(likedMoviesStore)
const { isFiltering } = storeToRefs(filterStore)

// Filter menu state
const isFilterMenuOpen = ref(false)

// Liked movies data
const likedMoviesData = ref<MovieEntry[]>([])

// Filtered liked movies (apply current filters to liked movies)
const filteredLikedMovies = computed(() => {
  if (likedMoviesData.value.length === 0) return []
  
  // Apply the same filters as the main page
  return filterStore.applyFilters(likedMoviesData.value)
})

// Load liked movies data
const loadLikedMovies = async () => {
  if (likedMovies.value.length === 0) {
    likedMoviesData.value = []
    return
  }

  try {
    // Fetch full movie data for liked movie IDs
    const movies = await movieStore.fetchMoviesByIds(likedMovies.value)
    likedMoviesData.value = movies
  } catch (_err) {
    console.error('Failed to load liked movies:', _err)
    likedMoviesData.value = []
  }
}

// Reset filters
const resetFilters = () => {
  filterStore.resetFilters()
}

// Load movies on mount and when liked movies change
onMounted(async () => {
  await movieStore.loadFromFile()
  await loadLikedMovies()
})

// Watch for changes in liked movies
watch(likedMovies, loadLikedMovies, { deep: true })

// Keyboard shortcuts
const keys = useMagicKeys()
const { Escape } = keys

// Escape key closes filter menu
if (Escape) {
  whenever(Escape, () => {
    if (isFilterMenuOpen.value) {
      isFilterMenuOpen.value = false
    }
  })
}

// 'K' key toggles filter menu (with Ctrl/Cmd modifier)
onKeyStroke('k', (e) => {
  if (e.ctrlKey || e.metaKey) {
    const activeElement = window.document.activeElement
    const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'
    
    if (!isTyping) {
      e.preventDefault()
      isFilterMenuOpen.value = !isFilterMenuOpen.value
    }
  }
})
</script>