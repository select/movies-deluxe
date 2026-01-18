<template>
  <div
    v-show="shouldShowSearch"
    ref="searchContainer"
    class="fixed top-0 left-0 right-0 z-50 bg-theme-surface border-b border-theme-border shadow-xl transition-all duration-300"
    :class="shouldShowSearch ? 'translate-y-0' : '-translate-y-full'"
  >
    <div class="max-w-4xl mx-auto px-4 py-4 space-y-4">
      <!-- Search Input Row -->
      <div class="flex items-center gap-4">
        <div class="relative flex-1">
          <div class="absolute inset-y-0 left-2 flex items-center z-10">
            <div v-if="isFiltering" class="pl-2 pr-1">
              <div class="i-mdi-loading animate-spin text-lg text-theme-primary"></div>
            </div>
            <SearchModeSelector />
          </div>
          <input
            ref="searchInput"
            v-model="localQuery"
            type="text"
            class="block w-full pl-32 md:pl-36 pr-12 py-3 md:py-4 bg-theme-background border-2 border-transparent focus:border-theme-primary rounded-2xl text-xl md:text-2xl text-theme-text placeholder-theme-text-muted focus:outline-none transition-all shadow-inner"
            :placeholder="searchPlaceholder"
            @keydown.esc="handleEscape"
            @keydown.enter="handleEnter"
          />
          <div class="absolute inset-y-0 right-0 flex items-center pr-2 z-10">
            <button
              v-if="localQuery"
              class="p-2 hover:bg-theme-background rounded-full transition-colors"
              title="Clear search"
              @click="clearSearch"
            >
              <div class="i-mdi-close text-xl text-theme-textmuted hover:text-theme-text"></div>
            </button>
            <button
              class="p-2 hover:bg-theme-background rounded-full transition-colors group"
              title="Search tips"
              @click="openPopup('help', $event)"
            >
              <div
                class="i-mdi-help-circle-outline text-xl text-theme-textmuted group-hover:text-theme-primary transition-colors"
              ></div>
            </button>
          </div>
        </div>
      </div>

      <!-- Filter Buttons Row -->
      <div class="flex flex-wrap items-center gap-2 pb-1">
        <!-- Sort -->
        <FilterButton
          category="Sort"
          icon="i-mdi-sort"
          :active-value="currentSortLabel"
          :is-active="!isDefaultSort"
          @click="openPopup('sort', $event)"
          @clear="resetSort"
        />

        <!-- Rating -->
        <FilterButton
          category="Rating"
          icon="i-mdi-star"
          :active-value="filters.minRating > 0 ? `${filters.minRating.toFixed(1)}+` : ''"
          :is-active="filters.minRating > 0"
          @click="openPopup('rating', $event)"
          @clear="filters.minRating = 0"
        />

        <!-- Year -->
        <FilterButton
          category="Year"
          icon="i-mdi-calendar"
          :active-value="yearLabel"
          :is-active="filters.minYear > 0 || (filters.maxYear ?? 0) > 0"
          @click="openPopup('year', $event)"
          @clear="clearYears"
        />

        <!-- Votes -->
        <FilterButton
          category="Votes"
          icon="i-mdi-account-group"
          :active-value="votesLabel"
          :is-active="
            filters.minVotes > 0 ||
            ((filters.maxVotes ?? 0) > 0 && (filters.maxVotes ?? 0) < 1000000)
          "
          @click="openPopup('votes', $event)"
          @clear="clearVotes"
        />

        <!-- Genres -->
        <FilterButton
          category="Genres"
          icon="i-mdi-movie-filter"
          :active-value="filters.genres.length > 0 ? filters.genres.length : ''"
          :is-active="filters.genres.length > 0"
          @click="openPopup('genres', $event)"
          @clear="filters.genres = []"
        />

        <!-- Countries -->
        <FilterButton
          category="Countries"
          icon="i-mdi-earth"
          :active-value="filters.countries.length > 0 ? filters.countries.length : ''"
          :is-active="filters.countries.length > 0"
          @click="openPopup('countries', $event)"
          @clear="filters.countries = []"
        />

        <!-- Sources -->
        <FilterButton
          category="Source"
          icon="i-mdi-source-branch"
          :active-value="filters.sources.length > 0 ? filters.sources.length : ''"
          :is-active="filters.sources.length > 0"
          @click="openPopup('source', $event)"
          @clear="filters.sources = []"
        />

        <!-- Clear All -->
        <button
          v-if="hasActiveFilters"
          class="text-xs font-bold text-theme-primary hover:bg-theme-primary/10 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap md:ml-auto"
          @click="
            Object.assign(filters, {
              sort: { field: 'year', direction: 'desc' },
              sources: [],
              minRating: 0,
              minYear: 0,
              maxYear: 0,
              minVotes: 0,
              maxVotes: 0,
              genres: [],
              countries: [],
              searchQuery: '',
              searchMode: 'exact',
            })
          "
        >
          Clear All
        </button>
      </div>
    </div>

    <!-- Popups -->
    <FilterPopup
      :is-open="activePopup === 'sort'"
      title="Sort By"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterSortControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'rating'"
      title="Minimum Rating"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterRatingControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'year'"
      title="Year Range"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterYearControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'votes'"
      title="Votes Range"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterVotesControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'genres'"
      title="Genres"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterGenresControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'countries'"
      title="Countries"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterCountriesControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'source'"
      title="Sources"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <FilterSourceControl />
    </FilterPopup>

    <FilterPopup
      :is-open="activePopup === 'help'"
      title="Search Tips"
      :anchor-el="anchorEl"
      @close="closePopup"
    >
      <div class="p-4 max-w-xs space-y-3 text-sm">
        <p class="text-theme-textmuted">Use keywords for field-specific search:</p>
        <ul class="space-y-2">
          <li class="flex items-center gap-2">
            <code class="bg-theme-background px-1.5 py-0.5 rounded text-theme-primary font-mono"
              >actor:</code
            >
            <span class="text-theme-text">Search by actor</span>
          </li>
          <li class="flex items-center gap-2">
            <code class="bg-theme-background px-1.5 py-0.5 rounded text-theme-primary font-mono"
              >director:</code
            >
            <span class="text-theme-text">Search by director</span>
          </li>
          <li class="flex items-center gap-2">
            <code class="bg-theme-background px-1.5 py-0.5 rounded text-theme-primary font-mono"
              >writer:</code
            >
            <span class="text-theme-text">Search by writer</span>
          </li>
          <li class="flex items-center gap-2">
            <code class="bg-theme-background px-1.5 py-0.5 rounded text-theme-primary font-mono"
              >title:</code
            >
            <span class="text-theme-text">Search by title</span>
          </li>
        </ul>
        <div class="pt-2 border-t border-theme-border">
          <p class="text-theme-textmuted mb-1">Use quotes for spaces:</p>
          <code class="block bg-theme-background p-2 rounded text-theme-primary font-mono"
            >actor:"Tom Hanks"</code
          >
        </div>
        <div class="pt-2 border-t border-theme-border">
          <p class="text-theme-textmuted mb-1">Combine multiple keywords:</p>
          <code class="block bg-theme-background p-2 rounded text-theme-primary font-mono"
            >actor:Keanu title:Matrix</code
          >
        </div>
      </div>
    </FilterPopup>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside, useDebounceFn } from '@vueuse/core'

const movieStore = useMovieStore()
const { filters, hasActiveFilters, isFiltering } = storeToRefs(movieStore)

const uiStore = useUiStore()
const { isSearchOpen } = storeToRefs(uiStore)
const { setSearchOpen } = uiStore

const searchInput = ref<HTMLInputElement | null>(null)
const searchContainer = ref<HTMLElement | null>(null)
const route = useRoute()

// Local query for immediate UI updates
const localQuery = ref(filters.value.searchQuery)

// Popup state
const activePopup = ref<string | null>(null)
const anchorEl = ref<HTMLElement | null>(null)

const openPopup = (type: string, event: MouseEvent) => {
  if (activePopup.value === type) {
    activePopup.value = null
    anchorEl.value = null
  } else {
    activePopup.value = type
    anchorEl.value = event.currentTarget as HTMLElement
  }
}

const closePopup = () => {
  activePopup.value = null
  anchorEl.value = null
}

// Labels and computed state
const isDefaultSort = computed(() => {
  return filters.value.sort.field === 'year' && filters.value.sort.direction === 'desc'
})

const currentSortLabel = computed(() => {
  if (isDefaultSort.value) return ''
  const field = filters.value.sort.field
  const dir = filters.value.sort.direction

  if (field === 'relevance') return 'Relevance'
  if (field === 'year') return dir === 'desc' ? 'Newest' : 'Oldest'
  if (field === 'rating') return dir === 'desc' ? 'High' : 'Low'
  if (field === 'title') return dir === 'asc' ? 'A-Z' : 'Z-A'
  if (field === 'votes') return 'Popular'
  return ''
})

const yearLabel = computed(() => {
  const min = filters.value.minYear
  const max = filters.value.maxYear
  if (min && max && min !== 1910 && max !== 2025) return `${min}-${max}`
  if (min && min !== 1910) return `${min}+`
  if (max && max !== 2025) return `Up to ${max}`
  return ''
})

const votesLabel = computed(() => {
  const min = filters.value.minVotes
  const max = filters.value.maxVotes
  if (min && max && max < 1000000) return `${formatCount(min)}-${formatCount(max)}`
  if (min) return `${formatCount(min)}+`
  if (max && max < 1000000) return `< ${formatCount(max)}`
  return ''
})

const searchPlaceholder = computed(() => {
  const mode = filters.value.searchMode
  if (mode === 'semantic') return 'Describe what you want to watch...'
  return 'Search movies... (try: actor:Tom Hanks, director:Nolan)'
})

const resetSort = () => {
  filters.value.sort = { field: 'year', direction: 'desc' }
}
const clearYears = () => {
  filters.value.minYear = 0
  filters.value.maxYear = 0
}
const clearVotes = () => {
  filters.value.minVotes = 0
  filters.value.maxVotes = 0
}

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
  filters.value.searchQuery = query

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
    filters.value.sort = { field: 'relevance', direction: 'desc' }
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

// Track if we should show search based on route and state
const shouldShowSearch = computed(() => {
  // Always show search on search page
  if (route.path === '/search') {
    return true
  }

  // Show if search is open OR if there's an active query
  return isSearchOpen.value || localQuery.value !== ''
})

// Auto-focus input when opened or on search page
watch(
  [isSearchOpen, () => route.path],
  ([isOpen, path]) => {
    if (isOpen || path === '/search') {
      nextTick(() => {
        searchInput.value?.focus()
      })
    }
  },
  { immediate: true }
)

// Restore search visibility when returning to home or search page with active query
watch(
  () => route.path,
  newPath => {
    if (newPath === '/search') {
      setSearchOpen(true)
    } else if (newPath === '/' && localQuery.value) {
      setSearchOpen(true)
    }
  }
)

// Click outside to close (only when query is empty, no popup open, and NOT on search page)
onClickOutside(searchContainer, () => {
  if (route.path === '/search') return

  if (!localQuery.value && !activePopup.value) {
    closeSearch()
  }
})

// Clear search query
const clearSearch = () => {
  localQuery.value = ''
}

// Close search overlay
const closeSearch = () => {
  if (route.path === '/search') return
  setSearchOpen(false)
}

// Handle ESC key: first press closes popup, second clears query, third closes (if not on search page)
const handleEscape = () => {
  if (activePopup.value) {
    closePopup()
  } else if (localQuery.value) {
    // First ESC: clear the query
    clearSearch()
  } else if (route.path !== '/search') {
    // Second ESC: close the search (only if query is empty and not on search page)
    closeSearch()
  }
}

// Handle Enter key
const handleEnter = () => {
  if (!activePopup.value && route.path !== '/search') {
    closeSearch()
  }
}
</script>
