<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <label class="block text-sm font-bold text-theme-textmuted uppercase tracking-wider">
        Saved Queries
      </label>
      <button
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
        @click="saveCurrentQuery"
      >
        <div class="i-mdi-plus"></div>
        Save Current Search
      </button>
    </div>

    <div
      v-if="!queries || queries.length === 0"
      class="text-sm text-theme-textmuted italic p-4 bg-theme-surface border border-theme-border border-dashed rounded-xl text-center"
    >
      No saved queries for this collection.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="(query, index) in queries"
        :key="index"
        class="p-4 bg-theme-surface border border-theme-border rounded-xl group hover:border-theme-textmuted transition-all"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 space-y-2">
            <div class="flex items-center gap-2">
              <div class="i-mdi-magnify text-theme-textmuted"></div>
              <span class="font-bold text-sm">
                {{ query.searchQuery || 'All Movies' }}
              </span>
              <!-- Search Mode Badge -->
              <div
                v-if="query.filterState.searchMode && query.filterState.searchMode !== 'exact'"
                class="px-2 py-0.5 bg-blue-600/10 text-blue-600 border border-blue-600/20 rounded text-[10px] font-bold flex items-center gap-1"
              >
                <div class="i-mdi-sparkles"></div>
                Semantic
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <!-- Sort -->
              <div
                v-if="query.filterState.sort"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-sort"></div>
                {{ query.filterState.sort.field }} ({{ query.filterState.sort.direction }})
              </div>

              <!-- Year Range -->
              <div
                v-if="
                  (query.filterState.minYear && query.filterState.minYear > 0) ||
                  query.filterState.maxYear
                "
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-calendar"></div>
                {{ query.filterState.minYear || 1910 }} - {{ query.filterState.maxYear || 2025 }}
              </div>

              <!-- Rating -->
              <div
                v-if="query.filterState.minRating && query.filterState.minRating > 0"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-star"></div>
                {{ query.filterState.minRating }}+
              </div>

              <!-- Votes -->
              <div
                v-if="
                  (query.filterState.minVotes && query.filterState.minVotes > 0) ||
                  query.filterState.maxVotes
                "
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-account-group"></div>
                {{ (query.filterState.minVotes || 0).toLocaleString() }} -
                {{
                  query.filterState.maxVotes ? query.filterState.maxVotes.toLocaleString() : 'Any'
                }}
              </div>

              <!-- Genres -->
              <div
                v-if="query.filterState.genres?.length"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-movie-filter"></div>
                {{ query.filterState.genres.join(', ') }}
              </div>

              <!-- Sources -->
              <div
                v-if="query.filterState.sources?.length"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-source-branch"></div>
                {{ query.filterState.sources.join(', ') }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <button
              class="p-2 hover:bg-blue-600/10 text-blue-600 rounded-lg transition-colors"
              title="Apply Filters"
              @click="applyQuery(query)"
            >
              <div class="i-mdi-filter-variant"></div>
            </button>
            <button
              class="p-2 hover:bg-red-600/10 text-red-600 rounded-lg transition-colors"
              title="Remove Query"
              @click="removeQuery(index)"
            >
              <div class="i-mdi-delete"></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FilterState } from '~/types'
// SavedQuery and SavedQueryFilterState are auto-imported from shared/types/

const props = defineProps<{
  collectionId: string
  queries?: SavedQuery[]
  filters: FilterState
}>()

const emit = defineEmits<{
  filtersApplied: []
}>()

const collectionsStore = useCollectionsStore()
const injectedFilters = inject(FILTER_STATE_KEY, null)
const filters = injectedFilters || toRef(props, 'filters')

const saveCurrentQuery = async () => {
  // Default values to compare against
  const DEFAULT_SORT = { field: 'year', direction: 'desc' }
  const DEFAULT_MODE = 'exact'

  // Only include sort if it's not the default
  const isDefaultSort =
    props.filters.sort.field === DEFAULT_SORT.field &&
    props.filters.sort.direction === DEFAULT_SORT.direction

  // Create a clean FilterState, only including non-default values
  const filterState: SavedQueryFilterState = {
    searchQuery: props.filters.searchQuery,
  }

  // Only add non-default values
  if (!isDefaultSort) {
    filterState.sort = { ...props.filters.sort }
  }
  if (props.filters.searchMode !== DEFAULT_MODE) {
    filterState.searchMode = props.filters.searchMode
  }
  if (props.filters.sources.length > 0) {
    filterState.sources = [...props.filters.sources]
  }
  if (props.filters.minRating > 0) {
    filterState.minRating = props.filters.minRating
  }
  if (props.filters.minYear > 0) {
    filterState.minYear = props.filters.minYear
  }
  if (props.filters.maxYear && props.filters.maxYear > 0) {
    filterState.maxYear = props.filters.maxYear
  }
  if (props.filters.minVotes > 0) {
    filterState.minVotes = props.filters.minVotes
  }
  if (props.filters.maxVotes && props.filters.maxVotes > 0) {
    filterState.maxVotes = props.filters.maxVotes
  }
  if (props.filters.genres.length > 0) {
    filterState.genres = [...props.filters.genres]
  }
  if (props.filters.countries.length > 0) {
    filterState.countries = [...props.filters.countries]
  }

  const query: SavedQuery = {
    searchQuery: props.filters.searchQuery,
    filterState,
  }

  await collectionsStore.addQueryToCollection(props.collectionId, query)
}

const removeQuery = async (index: number) => {
  if (confirm('Are you sure you want to remove this saved query?')) {
    await collectionsStore.removeQueryFromCollection(props.collectionId, index)
  }
}

const applyQuery = (query: SavedQuery) => {
  // Reset filters to defaults
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

  // Restore search query from the saved query
  if (query.searchQuery) {
    filters.value.searchQuery = query.searchQuery
  }

  // Restore search mode
  if (query.filterState.searchMode) {
    filters.value.searchMode = query.filterState.searchMode
  }

  // Apply sort if it was saved (otherwise use default from reset)
  if (query.filterState.sort) {
    filters.value.sort = query.filterState.sort
  }

  // Apply filters only if they were saved
  if (query.filterState.minRating) {
    filters.value.minRating = query.filterState.minRating
  }
  if (query.filterState.minYear) {
    filters.value.minYear = query.filterState.minYear
  }
  if (query.filterState.maxYear) {
    filters.value.maxYear = query.filterState.maxYear
  }
  if (query.filterState.minVotes) {
    filters.value.minVotes = query.filterState.minVotes
  }
  if (query.filterState.maxVotes) {
    filters.value.maxVotes = query.filterState.maxVotes
  }

  // Apply array filters
  if (query.filterState.genres) {
    filters.value.genres = [...query.filterState.genres]
  }
  if (query.filterState.countries) {
    filters.value.countries = [...query.filterState.countries]
  }
  if (query.filterState.sources) {
    filters.value.sources = [...query.filterState.sources]
  }

  // Emit event to notify parent that filters were applied
  emit('filtersApplied')
}
</script>
