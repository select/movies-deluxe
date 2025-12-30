<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="transform -translate-y-full opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform -translate-y-full opacity-0"
  >
    <div
      v-if="isSearchOpen"
      class="fixed top-0 left-0 right-0 z-50 bg-theme-surface border-b border-theme-border shadow-xl px-4 py-4 md:py-6"
    >
      <div class="max-w-4xl mx-auto flex items-center gap-4">
        <div class="relative flex-1">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <div class="i-mdi-magnify text-2xl text-theme-text-muted" />
          </div>
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="block w-full pl-12 pr-12 py-3 md:py-4 bg-theme-background border-2 border-transparent focus:border-theme-primary rounded-2xl text-xl md:text-2xl text-theme-text placeholder-theme-text-muted focus:outline-none transition-all shadow-inner"
            placeholder="Search movies, actors, directors..."
            @keydown.esc="setSearchOpen(false)"
            @keydown.enter="handleEnter"
          >
          <button
            v-if="searchQuery"
            class="absolute inset-y-0 right-0 pr-4 flex items-center"
            @click="searchQuery = ''"
          >
            <div class="i-mdi-close text-xl text-theme-text-muted hover:text-theme-text" />
          </button>
        </div>
        <button
          class="p-2 md:p-3 rounded-xl hover:bg-theme-background text-theme-text-muted hover:text-theme-text transition-colors"
          title="Close search"
          @click="setSearchOpen(false)"
        >
          <div class="i-mdi-close text-2xl md:text-3xl" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)
const { setSearchQuery, setSort } = movieStore

const uiStore = useUiStore()
const { isSearchOpen } = storeToRefs(uiStore)
const { setSearchOpen } = uiStore

const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref(filters.value.searchQuery)
const route = useRoute()

// Sync local query with store
watch(() => filters.value.searchQuery, (newVal) => {
  searchQuery.value = newVal
})

// Update store when local query changes
watch(searchQuery, (newVal) => {
  setSearchQuery(newVal)
  
  // If searching from another page, navigate to home
  if (newVal && route.path !== '/') {
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

const handleEnter = () => {
  setSearchOpen(false)
}
</script>
