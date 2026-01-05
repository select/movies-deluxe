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
        <div class="i-mdi-plus" />
        Save Current Search
      </button>
    </div>

    <div
      v-if="!queries || queries.length === 0"
      class="text-sm text-theme-textmuted italic p-4 bg-theme-surface border border-theme-border border-dashed rounded-xl text-center"
    >
      No saved queries for this collection.
    </div>

    <div
      v-else
      class="space-y-3"
    >
      <div
        v-for="(query, index) in queries"
        :key="index"
        class="p-4 bg-theme-surface border border-theme-border rounded-xl group hover:border-theme-textmuted transition-all"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 space-y-2">
            <div class="flex items-center gap-2">
              <div class="i-mdi-magnify text-theme-textmuted" />
              <span class="font-bold text-sm">
                {{ query.searchQuery || 'All Movies' }}
              </span>
            </div>

            <div class="flex flex-wrap gap-2">
              <!-- Sort -->
              <div
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-sort" />
                {{ query.filterState.sort.field }} ({{ query.filterState.sort.direction }})
              </div>

              <!-- Year Range -->
              <div
                v-if="query.filterState.minYear > 0 || query.filterState.maxYear"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-calendar" />
                {{ query.filterState.minYear || 1910 }} - {{ query.filterState.maxYear || 2025 }}
              </div>

              <!-- Rating -->
              <div
                v-if="query.filterState.minRating > 0"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-star" />
                {{ query.filterState.minRating }}+
              </div>

              <!-- Votes -->
              <div
                v-if="query.filterState.minVotes > 0 || query.filterState.maxVotes"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-account-group" />
                {{ query.filterState.minVotes.toLocaleString() }} -
                {{
                  query.filterState.maxVotes ? query.filterState.maxVotes.toLocaleString() : 'Any'
                }}
              </div>

              <!-- Genres -->
              <div
                v-if="query.filterState.genres?.length"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-movie-filter" />
                {{ query.filterState.genres.join(', ') }}
              </div>

              <!-- Sources -->
              <div
                v-if="query.filterState.sources?.length"
                class="px-2 py-0.5 bg-theme-bg border border-theme-border rounded text-[10px] font-mono flex items-center gap-1"
              >
                <div class="i-mdi-source-branch" />
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
              <div class="i-mdi-filter-variant" />
            </button>
            <button
              class="p-2 hover:bg-red-600/10 text-red-600 rounded-lg transition-colors"
              title="Remove Query"
              @click="removeQuery(index)"
            >
              <div class="i-mdi-delete" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end pt-2">
      <button
        class="px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
        :disabled="isRefreshing || !queries?.length"
        @click="refreshCollection"
      >
        <div :class="[isRefreshing ? 'i-mdi-loading animate-spin' : 'i-mdi-refresh']" />
        Refresh Collection from Queries
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SavedQuery } from '~/types'

const props = defineProps<{
  collectionId: string
  queries?: SavedQuery[]
}>()

const collectionsStore = useCollectionsStore()
const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)

const isRefreshing = ref(false)

const saveCurrentQuery = async () => {
  // Create a clean FilterState without frontend-only fields
  const filterState = {
    sort: { ...filters.value.sort },
    sources: [...filters.value.sources],
    minRating: filters.value.minRating,
    minYear: filters.value.minYear,
    maxYear: filters.value.maxYear,
    minVotes: filters.value.minVotes,
    maxVotes: filters.value.maxVotes,
    genres: [...filters.value.genres],
    countries: [...filters.value.countries],
    searchQuery: filters.value.searchQuery,
    currentPage: 1,
    lastScrollY: 0,
  }

  const query: SavedQuery = {
    searchQuery: filters.value.searchQuery,
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
  movieStore.resetFilters()
  movieStore.setSearchQuery(query.searchQuery)
  movieStore.setSort(query.filterState.sort)
  movieStore.setMinRating(query.filterState.minRating)
  movieStore.setMinYear(query.filterState.minYear)
  if (query.filterState.maxYear) movieStore.setMaxYear(query.filterState.maxYear)
  movieStore.setMinVotes(query.filterState.minVotes)
  if (query.filterState.maxVotes) movieStore.setMaxVotes(query.filterState.maxVotes)

  query.filterState.genres.forEach(g => movieStore.toggleGenre(g))
  query.filterState.countries.forEach(c => movieStore.toggleCountry(c))
  query.filterState.sources.forEach(s => movieStore.toggleSource(s))
}

const refreshCollection = async () => {
  isRefreshing.value = true
  try {
    const result = await collectionsStore.refreshCollectionFromQuery(props.collectionId)
    if (result.success) {
      alert(`Collection refreshed! Now contains ${result.movieCount} movies.`)
    }
  } finally {
    isRefreshing.value = false
  }
}
</script>
