<template>
  <div>
    <!-- Sticky Search Header -->
    <div
      class="sticky top-0 z-50 bg-theme-surface border-b border-theme-border shadow-xl px-4 py-4 md:py-6"
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
            @keydown.enter="searchInput?.blur()"
          />
          <button
            v-if="localQuery"
            class="absolute inset-y-0 right-0 pr-4 flex items-center"
            @click="clearSearch"
          >
            <div class="i-mdi-close text-xl text-theme-textmuted hover:text-theme-text" />
          </button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="md:ml-16">
      <div class="px-4 lg:px-[6%] py-8">
        <MovieStats
          v-if="!isInitialLoading && safeTotalMovies > 0"
          :total-movies="safeTotalMovies"
        />
      </div>

      <div class="relative lg:px-[6%] px-4">
        <template v-if="isInitialLoading || isFiltering">
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          >
            <MovieCardSkeleton v-for="i in 12" :key="i" />
          </div>
        </template>

        <template v-else-if="currentMovieList.length > 0">
          <MovieVirtualGrid
            :movies="currentMovieList"
            :total-movies="safeTotalMovies"
            @load-more="loadMore"
          />
        </template>

        <div v-else class="text-center py-12">
          <p class="text-theme-textmuted">No movies found.</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { useWindowScroll, useDebounceFn } from '@vueuse/core'

// Set page title and meta
useHead({
  title: 'Search Movies - Movies Deluxe',
  meta: [
    {
      name: 'description',
      content:
        'Search and filter thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more.',
    },
    { property: 'og:title', content: 'Search Movies - Movies Deluxe' },
    { property: 'og:type', content: 'website' },
  ],
})

const movieStore = useMovieStore()
const { isInitialLoading, isFiltering, currentMovieList, totalFiltered, filters } =
  storeToRefs(movieStore)
const { loadFromFile, setCurrentPage, setScrollY, setSearchQuery, setSort } = movieStore

const safeTotalMovies = computed(() => totalFiltered.value || 0)

// Track window scroll position
const { y: windowScrollY } = useWindowScroll()

// Search functionality
const searchInput = ref<HTMLInputElement | null>(null)
const route = useRoute()
const router = useRouter()

// Local query for immediate UI updates
const localQuery = ref(filters.value.searchQuery)

// Initialize search from URL query parameter on mount
const initializeSearch = () => {
  const urlQuery = route.query.q as string
  if (urlQuery && urlQuery !== localQuery.value) {
    localQuery.value = urlQuery
  }
}

// Debounced function to update store (500ms delay)
const debouncedSetSearchQuery = useDebounceFn((query: string) => {
  setSearchQuery(query)

  // Update URL query parameter
  if (query) {
    router.replace({ query: { q: query } })
  } else {
    router.replace({ query: {} })
  }

  if (query && filters.value.sort.field !== 'relevance') {
    setSort({ field: 'relevance', direction: 'desc' })
  }
}, 500)

// Watch local query and debounce updates to store
watch(localQuery, newVal => {
  debouncedSetSearchQuery(newVal)
})

// Sync local query when store changes externally (e.g., clear filters)
watch(
  () => filters.value.searchQuery,
  newVal => {
    if (newVal !== localQuery.value) {
      localQuery.value = newVal
    }
  }
)

// Clear search query
const clearSearch = () => {
  localQuery.value = ''
}

// Load movies on mount
onMounted(async () => {
  initializeSearch()
  await loadFromFile()

  // Auto-focus search input
  nextTick(() => {
    searchInput.value?.focus()
  })

  // Restore scroll position after content loads
  await nextTick()
  await nextTick()

  const savedScrollY = filters.value.lastScrollY
  if (savedScrollY > 0) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollY, behavior: 'instant' })
      setTimeout(() => {
        if (Math.abs(window.scrollY - savedScrollY) > 10) {
          window.scrollTo({ top: savedScrollY, behavior: 'instant' })
        }
      }, 50)
    })
  }
})

// Save scroll position before leaving
onBeforeRouteLeave(() => {
  setScrollY(windowScrollY.value)
})

// Load more movies
const loadMore = () => {
  setCurrentPage(filters.value.currentPage + 1)
}
</script>

<style scoped>
/* No extra styles needed for now */
</style>
