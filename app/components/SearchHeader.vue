<template>
  <div
    v-show="shouldShowSearch"
    ref="searchContainer"
    class="fixed top-0 left-0 right-0 z-50 bg-theme-surface border-b border-theme-border shadow-xl px-4 py-4 md:py-6 transition-transform duration-300"
    :class="shouldShowSearch ? 'translate-y-0' : '-translate-y-full'"
  >
      <div class="max-w-4xl mx-auto flex items-center gap-4">
        <div class="relative flex-1">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <div class="i-mdi-magnify text-2xl text-theme-textmuted" />
          </div>
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="block w-full pl-12 pr-12 py-3 md:py-4 bg-theme-background border-2 border-transparent focus:border-theme-primary rounded-2xl text-xl md:text-2xl text-theme-text placeholder-theme-text-muted focus:outline-none transition-all shadow-inner"
            placeholder="Search movies, actors, directors..."
            @keydown.esc="handleEscape"
            @keydown.enter="handleEnter"
          >
          <button
            v-if="searchQuery"
            class="absolute inset-y-0 right-0 pr-4 flex items-center"
            @click="clearSearch"
          >
            <div class="i-mdi-close text-xl text-theme-textmuted hover:text-theme-text" />
          </button>
        </div>
        <button
          v-if="!searchQuery"
          class="p-2 md:p-3 rounded-xl hover:bg-theme-background text-theme-textmuted hover:text-theme-text transition-colors"
          title="Close search"
          @click="closeSearch"
        >
          <div class="i-mdi-close text-2xl md:text-3xl" />
        </button>
      </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)
const { setSearchQuery, setSort } = movieStore

const uiStore = useUiStore()
const { isSearchOpen } = storeToRefs(uiStore)
const { setSearchOpen } = uiStore

const searchInput = ref<HTMLInputElement | null>(null)
const searchContainer = ref<HTMLElement | null>(null)
const searchQuery = ref(filters.value.searchQuery)
const route = useRoute()

// Track if we should show search based on route and state
const shouldShowSearch = computed(() => {
  // Determine if current route is a grid page (where search should be visible)
  const isGridPage = 
    route.path === '/' ||
    route.path === '/liked' ||
    route.path === '/collections'
  
  // Hide search on non-grid pages (movie detail, collection detail, admin)
  if (!isGridPage) {
    return false
  }
  
  // Show if search is open OR if there's an active query
  return isSearchOpen.value || searchQuery.value !== ''
})

// Sync local query with store
watch(() => filters.value.searchQuery, (newVal) => {
  searchQuery.value = newVal
})

// Update store when local query changes
watch(searchQuery, (newVal) => {
  setSearchQuery(newVal)

  // If searching from a non-grid page, navigate to home
  const isGridPage = 
    route.path === '/' ||
    route.path === '/liked' ||
    route.path === '/collections'
  
  if (newVal && !isGridPage) {
    navigateTo('/')
  }

  if (newVal && filters.value.sort.field !== 'relevance') {
    setSort({ field: 'relevance', direction: 'desc', label: 'Relevance' })
  }
})

// Auto-focus input when opened
watch(isSearchOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// Restore search visibility when returning to grid pages with active query
watch(() => route.path, (newPath) => {
  const isGridPage = 
    newPath === '/' ||
    newPath === '/liked' ||
    newPath === '/collections'
  
  if (isGridPage && searchQuery.value) {
    setSearchOpen(true)
  }
})

// Click outside to close (only when query is empty)
onClickOutside(searchContainer, () => {
  if (!searchQuery.value) {
    closeSearch()
  }
})

// Clear search query
const clearSearch = () => {
  searchQuery.value = ''
}

// Close search overlay
const closeSearch = () => {
  setSearchOpen(false)
}

// Handle ESC key: first press clears query, second press closes
const handleEscape = () => {
  if (searchQuery.value) {
    // First ESC: clear the query
    clearSearch()
  } else {
    // Second ESC: close the search (only if query is empty)
    closeSearch()
  }
}

// Handle Enter key
const handleEnter = () => {
  closeSearch()
}
</script>
