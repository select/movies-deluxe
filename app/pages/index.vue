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
          v-else-if="movieStore.totalCount > 0"
          :total-count="movieStore.totalCount"
          :archive-count="0"
          :youtube-count="0"
          :enriched-count="0"
        />

        <!-- Movie Grid -->
        <MovieVirtualGrid
          v-if="movieStore.totalCount > 0"
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

// Load movies on mount
onMounted(async () => {
  await movieStore.init()

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

// Reset pagination when filters change (excluding currentPage itself)
watch(
  () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { currentPage, lastScrollY, ...rest } = filterStore.filters
    return JSON.stringify(rest)
  },
  () => {
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

// Computed properties (prefixed with _ to indicate intentionally unused)
const _archiveCount = computed(() => {
  return 0 // TODO: Implement in store if needed
})

const _youtubeCount = computed(() => {
  return 0 // TODO: Implement in store if needed
})

const _enrichedCount = computed(() => {
  return 0 // TODO: Implement in store if needed
})
</script>
