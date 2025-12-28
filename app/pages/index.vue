<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <!-- Header -->
      <MovieHeader />

      <!-- Mobile Menu Button -->
      <MobileMenuButton 
        :is-open="isFilterMenuOpen"
        @open-filters="isFilterMenuOpen = true" 
      />

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
          <MovieStats
            v-if="!movieStore.isInitialLoading && safeTotalMovies > 0"
            :total-movies="safeTotalMovies"
          />
        </div>

        <div class="relative">
          <template v-if="movieStore.isInitialLoading">
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-4 lg:px-[6%]">
              <MovieCardSkeleton
                v-for="i in 12"
                :key="i"
              />
            </div>
          </template>

          <template v-else-if="safeLightweightMovies.length > 0">
            <MovieVirtualGrid
              :movies="safeLightweightMovies"
              :total-movies="safeTotalMovies"
              :has-more="hasMore"
              @load-more="loadMore"
            />
          </template>

          <div
            v-else
            class="text-center py-12"
          >
            <p class="text-gray-600 dark:text-gray-400">
              No movies found.
            </p>
          </div>
        </div>
      </main>
    </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMagicKeys, whenever, onKeyStroke } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'

// Set page title and meta
useHead({
  title: 'Movies Deluxe - Free Public Domain Movies',
  meta: [
    {
      name: 'description',
      content:
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more - all legally available to watch online.',
    },
    { property: 'og:title', content: 'Movies Deluxe - Free Public Domain Movies' },
    {
      property: 'og:description',
      content:
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more - all legally available to watch online.',
    },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Movies Deluxe - Free Public Domain Movies' },
    {
      name: 'twitter:description',
      content:
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more - all legally available to watch online.',
    },
  ],
})

const movieStore = useMovieStore()
const filterStore = useFilterStore()
const { lightweightMovies, totalMovies } = storeToRefs(filterStore)

// Ensure lightweightMovies is always an array
const safeLightweightMovies = computed(() => lightweightMovies.value || [])
const safeTotalMovies = computed(() => totalMovies.value || 0)

// Filter menu state
const isFilterMenuOpen = ref(false)

// Load movies on mount
onMounted(async () => {
  await movieStore.loadFromFile()
})

// Save scroll position before leaving (might need adjustment for virtual grid)
onBeforeRouteLeave(() => {
  // filterStore.setScrollY(windowScrollY.value)
})

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

// Computed properties
const hasMore = computed(() => {
  return safeLightweightMovies.value.length < safeTotalMovies.value
})

// Load more movies
const loadMore = () => {
  filterStore.setCurrentPage(filterStore.filters.currentPage + 1)
}
</script>

<style scoped>
/* No extra styles needed for now */
</style>
