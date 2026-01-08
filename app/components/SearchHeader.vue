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
            v-model="localQuery"
            type="text"
            class="block w-full pl-12 pr-12 py-3 md:py-4 bg-theme-background border-2 border-transparent focus:border-theme-primary rounded-2xl text-xl md:text-2xl text-theme-text placeholder-theme-text-muted focus:outline-none transition-all shadow-inner"
            placeholder="Search movies, actors, directors..."
            @keydown.esc="handleEscape"
            @keydown.enter="handleEnter"
          >
          <button
            v-if="localQuery"
            class="absolute inset-y-0 right-0 pr-4 flex items-center"
            @click="clearSearch"
          >
            <div class="i-mdi-close text-xl text-theme-textmuted hover:text-theme-text" />
          </button>
        </div>
        <button
          v-if="!localQuery"
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
import { onClickOutside, useDebounceFn } from '@vueuse/core'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)
const { setSearchQuery, setSort } = movieStore

const uiStore = useUiStore()
const { isSearchOpen } = storeToRefs(uiStore)
const { setSearchOpen } = uiStore

const searchInput = ref<HTMLInputElement | null>(null)
const searchContainer = ref<HTMLElement | null>(null)
const route = useRoute()

// Local query for immediate UI updates
const localQuery = ref(filters.value.searchQuery)

// Initialize search from URL query parameter on mount
onMounted(() => {
  const urlQuery = route.query.q as string
  if (urlQuery && urlQuery !== localQuery.value) {
    localQuery.value = urlQuery
    setSearchOpen(true)
  }
})

// Debounced function to update store (500ms delay)
const debouncedSetSearchQuery = useDebounceFn((query: string) => {
  setSearchQuery(query)

  // Update URL query parameter (but not on admin pages)
  if (!route.path.startsWith('/admin')) {
    const router = useRouter()
    if (query) {
      router.replace({ query: { q: query } })
    } else {
      router.replace({ query: {} })
    }
  }

  // If searching from a non-search page, navigate to search (but not from admin pages)
  if (query && route.path !== '/search' && !route.path.startsWith('/admin')) {
    navigateTo('/search')
  }

  if (query && filters.value.sort.field !== 'relevance') {
    setSort({ field: 'relevance', direction: 'desc' })
  }
}, 500)

// Watch local query and debounce updates to store
watch(localQuery, (newVal) => {
  debouncedSetSearchQuery(newVal)
})

// Sync local query when store changes externally (e.g., clear filters)
watch(() => filters.value.searchQuery, (newVal) => {
  if (newVal !== localQuery.value) {
    localQuery.value = newVal
  }
})

// Track if we should show search based on route and state
const shouldShowSearch = computed(() => {
  // Only show search on search page
  if (route.path !== '/search') {
    return false
  }

  // Show if search is open OR if there's an active query
  return isSearchOpen.value || localQuery.value !== ''
})

// Auto-focus input when opened
watch(isSearchOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// Restore search visibility when returning to home or search page with active query
watch(() => route.path, (newPath) => {
  if ((newPath === '/' || newPath === '/search') && localQuery.value) {
    setSearchOpen(true)
  }
})

// Click outside to close (only when query is empty)
onClickOutside(searchContainer, () => {
  if (!localQuery.value) {
    closeSearch()
  }
})

// Clear search query
const clearSearch = () => {
  localQuery.value = ''
}

// Close search overlay
const closeSearch = () => {
  setSearchOpen(false)
}

// Handle ESC key: first press clears query, second press closes
const handleEscape = () => {
  if (localQuery.value) {
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
