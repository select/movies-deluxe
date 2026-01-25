<template>
  <div class="space-y-4">
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
          class="block w-full pl-32 md:pl-36 pr-12 py-3 bg-theme-background border-2 border-theme-border/50 focus:border-theme-primary rounded-2xl text-lg text-theme-text placeholder-theme-text-muted focus:outline-none transition-all shadow-sm"
          :placeholder="searchPlaceholder"
          @keydown.enter="handleEnter"
        />
        <div class="absolute inset-y-0 right-0 flex items-center pr-2 z-10">
          <button
            v-if="localQuery"
            class="p-2 hover:bg-theme-surface rounded-full transition-colors"
            title="Clear search"
            @click="clearSearch"
          >
            <div class="i-mdi-close text-xl text-theme-textmuted hover:text-theme-text"></div>
          </button>
          <button
            class="p-2 hover:bg-theme-surface rounded-full transition-colors group"
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
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('sort', $event)"
        @clear="resetSort"
      />

      <!-- Rating -->
      <FilterButton
        category="Rating"
        icon="i-mdi-star"
        :active-value="filters.minRating > 0 ? `${filters.minRating.toFixed(1)}+` : ''"
        :is-active="filters.minRating > 0"
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('rating', $event)"
        @clear="
          () => {
            filters.minRating = 0
          }
        "
      />

      <!-- Year -->
      <FilterButton
        category="Year"
        icon="i-mdi-calendar"
        :active-value="yearLabel"
        :is-active="filters.minYear > 0 || (filters.maxYear ?? 0) > 0"
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('year', $event)"
        @clear="clearYears"
      />

      <!-- Votes -->
      <FilterButton
        category="Votes"
        icon="i-mdi-account-group"
        :active-value="votesLabel"
        :is-active="
          filters.minVotes > 0 || ((filters.maxVotes ?? 0) > 0 && (filters.maxVotes ?? 0) < 1000000)
        "
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('votes', $event)"
        @clear="clearVotes"
      />

      <!-- Genres -->
      <FilterButton
        category="Genres"
        icon="i-mdi-movie-filter"
        :active-value="filters.genres.length > 0 ? filters.genres.length : ''"
        :is-active="filters.genres.length > 0"
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('genres', $event)"
        @clear="
          () => {
            filters.genres = []
          }
        "
      />

      <!-- Countries -->
      <FilterButton
        category="Countries"
        icon="i-mdi-earth"
        :active-value="filters.countries.length > 0 ? filters.countries.length : ''"
        :is-active="filters.countries.length > 0"
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('countries', $event)"
        @clear="
          () => {
            filters.countries = []
          }
        "
      />

      <!-- Sources -->
      <FilterButton
        category="Source"
        icon="i-mdi-source-branch"
        :active-value="filters.sources.length > 0 ? filters.sources.length : ''"
        :is-active="filters.sources.length > 0"
        :disabled="filters.searchMode === 'semantic'"
        @click="openPopup('source', $event)"
        @clear="
          () => {
            filters.sources = []
          }
        "
      />

      <!-- Clear All -->
      <button
        v-if="hasActiveFilters"
        class="text-xs font-bold text-theme-primary hover:bg-theme-primary/10 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap md:ml-auto"
        :disabled="filters.searchMode === 'semantic'"
        :class="{ 'opacity-50 cursor-not-allowed': filters.searchMode === 'semantic' }"
        @click="resetAllFilters"
      >
        Clear All
      </button>
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
            >actor:"Roy Rogers"</code
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
import { useDebounceFn } from '@vueuse/core'
import type { FilterState } from '~/types'

const props = defineProps<{
  filters: FilterState
  isFiltering?: boolean
}>()

const emit = defineEmits<{
  (e: 'search'): void
}>()

// Provide filters to children (Filter*Control components)
const injectedFilters = inject(FILTER_STATE_KEY, null)
const filters = injectedFilters || toRef(props, 'filters')
provide(FILTER_STATE_KEY, filters)

const searchInput = ref<HTMLInputElement | null>(null)

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
  return props.filters.sort.field === 'year' && props.filters.sort.direction === 'desc'
})

const currentSortLabel = computed(() => {
  if (isDefaultSort.value) return ''
  const field = props.filters.sort.field
  const dir = props.filters.sort.direction

  if (field === 'relevance') return 'Relevance'
  if (field === 'year') return dir === 'desc' ? 'Newest' : 'Oldest'
  if (field === 'rating') return dir === 'desc' ? 'High' : 'Low'
  if (field === 'title') return dir === 'asc' ? 'A-Z' : 'Z-A'
  if (field === 'votes') return 'Popular'
  return ''
})

const yearLabel = computed(() => {
  const min = props.filters.minYear
  const max = props.filters.maxYear
  if (min && max && min !== 1910 && max !== 2025) return `${min}-${max}`
  if (min && min !== 1910) return `${min}+`
  if (max && max !== 2025) return `Up to ${max}`
  return ''
})

const votesLabel = computed(() => {
  const min = props.filters.minVotes
  const max = props.filters.maxVotes
  if (min && max && max < 1000000) return `${formatCount(min)}-${formatCount(max)}`
  if (min) return `${formatCount(min)}+`
  if (max && max < 1000000) return `< ${formatCount(max)}`
  return ''
})

const searchPlaceholder = computed(() => {
  const mode = props.filters.searchMode
  if (mode === 'semantic') return 'Describe what you want to watch...'
  return 'Search movies... (try: actor:Roy Rogers, director:Dave Fleischer)'
})

const hasActiveFilters = computed(() => {
  const f = props.filters
  return (
    f.sources.length > 0 ||
    f.minRating > 0 ||
    f.minYear > 0 ||
    f.minVotes > 0 ||
    f.genres.length > 0 ||
    f.countries.length > 0
  )
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

const resetAllFilters = () => {
  Object.assign(filters.value, {
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
  localQuery.value = ''
}

// Debounced function to update store (500ms delay)
const debouncedSetSearchQuery = useDebounceFn((query: string) => {
  // If query contains keywords, automatically switch to exact mode
  if (hasKeywords(query)) {
    filters.value.searchMode = 'exact'
  }

  filters.value.searchQuery = query

  if (query && filters.value.sort.field !== 'relevance') {
    filters.value.sort = { field: 'relevance', direction: 'desc' }
  }

  emit('search')
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

const handleEnter = () => {
  emit('search')
}

const clearSearch = () => {
  localQuery.value = ''
}
</script>
