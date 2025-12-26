<template>
  <div
    :class="darkModeToggle?.isDark ? 'dark' : ''"
    class="min-h-screen transition-colors"
  >
    <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <!-- Header -->
      <AppHeader ref="darkModeToggle" :scroll-y="windowScrollY" />

      <!-- Mobile Search Bar -->
      <AppMobileSearchBar />

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
        <MovieGridSkeleton v-if="movieStore.isInitialLoading" />

        <!-- Movie Stats -->
        <MovieStats
          v-else-if="movieStore.movies.length > 0"
          :total-count="filteredAndSortedMovies.length"
          :archive-count="archiveCount"
          :youtube-count="youtubeCount"
          :enriched-count="enrichedCount"
        />

        <!-- Movie Grid -->
        <MovieGrid
          v-if="movieStore.movies.length > 0"
          :movies="displayedMovies"
        />

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
        <InfiniteScrollSentinel v-if="hasMore" ref="sentinelRef" />

        <!-- End of List Message -->
        <div
          v-else-if="movieStore.movies.length > 0"
          class="text-center mt-8 py-4 text-sm text-gray-600 dark:text-gray-400"
        >
          You've reached the end of the list
        </div>
      </main>

      <!-- Footer -->
      <AppFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMagicKeys, whenever, useWindowScroll, onKeyStroke } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'

const movieStore = useMovieStore()
const filterStore = useFilterStore()
const { y: windowScrollY } = useWindowScroll()

// Dark mode toggle ref
const darkModeToggle = ref<{ isDark: Ref<boolean> } | null>(null)

// Filter menu state
const isFilterMenuOpen = ref(false)

// Pagination
const itemsPerPage = 20

// Infinite scroll sentinel ref
const sentinelRef = ref<HTMLElement | null>(null)

// Load movies on mount
onMounted(async () => {
  await movieStore.loadFromFile()

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
// Using onKeyStroke to prevent default browser behavior
onKeyStroke('k', (e) => {
  // Only trigger with Ctrl (Windows/Linux) or Cmd (Mac)
  if (e.ctrlKey || e.metaKey) {
    // Check if user is typing in an input/textarea
    const activeElement = window.document.activeElement
    const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'
    
    if (!isTyping) {
      e.preventDefault() // Prevent browser's default Ctrl+K behavior
      isFilterMenuOpen.value = !isFilterMenuOpen.value
    }
  }
})

// Computed properties
const filteredAndSortedMovies = computed(() => {
  return filterStore.filteredAndSortedMovies
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
