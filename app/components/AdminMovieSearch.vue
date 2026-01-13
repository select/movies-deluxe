<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <div class="relative flex-1">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-textmuted"
        >
          <div class="i-mdi-magnify text-xl"></div>
        </div>
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search by title, director, writer, plot or IMDb ID... (or use filters below)"
          class="block w-full pl-10 pr-3 py-3 border border-theme-border rounded-xl bg-theme-surface focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
          @input="onInput"
        />
        <div v-if="isLoading" class="absolute inset-y-0 right-0 pr-3 flex items-center">
          <div class="i-mdi-loading animate-spin text-blue-600"></div>
        </div>
      </div>

      <button
        class="px-4 py-3 bg-theme-surface border border-theme-border rounded-xl text-sm font-bold hover:bg-theme-selection transition-colors flex items-center gap-2"
        @click="showFilters = true"
      >
        <div class="i-mdi-filter-variant"></div>
        Filters
        <span
          v-if="activeFiltersCount > 0"
          class="bg-blue-600 text-white px-1.5 py-0.5 rounded-full text-[10px]"
        >
          {{ activeFiltersCount }}
        </span>
      </button>
    </div>

    <!-- Active Filters Display -->
    <div v-if="hasActiveFilters" class="flex flex-wrap items-center gap-2">
      <div
        v-if="filters.minRating > 0"
        class="px-2 py-1 bg-blue-600/10 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1"
      >
        <div class="i-mdi-star"></div>
        {{ filters.minRating }}+
      </div>
      <div
        v-if="filters.minYear > 0 || filters.maxYear"
        class="px-2 py-1 bg-blue-600/10 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1"
      >
        <div class="i-mdi-calendar"></div>
        {{ filters.minYear || 1910 }} - {{ filters.maxYear || 2025 }}
      </div>
      <div
        v-if="filters.minVotes > 0 || filters.maxVotes"
        class="px-2 py-1 bg-blue-600/10 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1"
      >
        <div class="i-mdi-account-group"></div>
        {{ filters.minVotes.toLocaleString() }} -
        {{ filters.maxVotes ? filters.maxVotes.toLocaleString() : 'Any' }}
      </div>
      <div
        v-for="genre in filters.genres"
        :key="genre"
        class="px-2 py-1 bg-blue-600/10 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1"
      >
        <div class="i-mdi-movie-filter"></div>
        {{ genre }}
      </div>
      <div
        v-for="source in filters.sources"
        :key="source"
        class="px-2 py-1 bg-blue-600/10 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1"
      >
        <div class="i-mdi-source-branch"></div>
        {{ source }}
      </div>
      <button
        class="text-xs text-theme-primary hover:underline ml-2"
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
          })
        "
      >
        Clear All
      </button>
    </div>

    <div
      v-if="results.length > 0"
      class="bg-theme-surface border border-theme-border rounded-2xl overflow-hidden"
    >
      <!-- Header with Add All button -->
      <div
        class="p-4 border-b border-theme-border flex items-center justify-between bg-theme-bg/30"
      >
        <div class="text-sm text-theme-textmuted">
          <span class="font-semibold text-theme-text">{{ results.length }}</span> results
          <span v-if="results.length === 300" class="text-xs">(limited to 300)</span>
        </div>
        <button
          class="px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50"
          :class="
            addingAll
              ? 'bg-theme-selection text-theme-textmuted cursor-wait'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          "
          :disabled="addingAll || isAdding !== ''"
          @click="addAllMovies"
        >
          <div v-if="addingAll" class="i-mdi-loading animate-spin"></div>
          <div v-else class="i-mdi-plus-box-multiple"></div>
          Add All to Collection
        </button>
      </div>

      <!-- Movie list -->
      <div class="divide-y divide-theme-border">
        <div
          v-for="movie in results"
          :key="movie.imdbId"
          class="p-4 flex items-center gap-4 hover:bg-theme-bg/50 transition-colors"
        >
          <div class="w-12 h-16 rounded bg-theme-selection relative overflow-hidden flex-shrink-0">
            <img
              v-if="movie.imdbId?.startsWith('tt')"
              :src="getPosterPath(movie.imdbId)"
              :alt="movie.title"
              class="w-full h-full object-cover"
              @error="e => ((e.target as HTMLImageElement).style.display = 'none')"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
            >
              <div class="i-mdi-movie text-2xl"></div>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h4 class="font-bold truncate">
                {{ movie.title }}
              </h4>
              <span class="text-xs text-theme-textmuted font-mono">{{ movie.year }}</span>
            </div>
            <p class="text-xs text-theme-textmuted truncate">
              {{ movie.genre || 'Unknown Genre' }}
            </p>
            <div class="flex items-center gap-2 text-[10px] text-theme-textmuted mt-0.5">
              <span class="font-mono">{{ movie.imdbId }}</span>
              <span v-if="movie.imdbRating" class="flex items-center gap-1">
                <span class="opacity-50">•</span>
                <div class="i-mdi-star text-theme-accent text-xs"></div>
                <span class="font-bold text-theme-text">{{ movie.imdbRating }}</span>
                <span v-if="movie.imdbVotes" class="opacity-70">
                  ({{ formatVotes(movie.imdbVotes) }})
                </span>
              </span>
            </div>
          </div>
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
            :class="
              isInCollection(movie.imdbId)
                ? 'bg-theme-selection text-theme-textmuted cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            "
            :disabled="isInCollection(movie.imdbId) || isAdding === movie.imdbId"
            @click="addMovie(movie.imdbId)"
          >
            <div v-if="isAdding === movie.imdbId" class="i-mdi-loading animate-spin"></div>
            <div v-else :class="isInCollection(movie.imdbId) ? 'i-mdi-check' : 'i-mdi-plus'"></div>
            {{ isInCollection(movie.imdbId) ? 'Added' : 'Add' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-else-if="(searchQuery.length >= 3 || hasActiveFilters) && !isLoading"
      class="p-8 text-center text-theme-textmuted bg-theme-surface border border-theme-border border-dashed rounded-2xl"
    >
      No movies found{{ searchQuery ? ` for "${searchQuery}"` : ''
      }}{{ hasActiveFilters ? ' with current filters' : '' }}
    </div>

    <FilterMenu :is-open="showFilters" @close="showFilters = false" />
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn, onKeyStroke } from '@vueuse/core'

const props = defineProps<{
  collectionId: string
}>()

const emit = defineEmits<{
  (e: 'add'): void
}>()

const collectionsStore = useCollectionsStore()
const movieStore = useMovieStore()
const { filters, activeFiltersCount, hasActiveFilters } = storeToRefs(movieStore)
const toastStore = useToastStore()

const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const results = ref<LightweightMovie[]>([])
const isLoading = ref(false)
const isAdding = ref('')
const addingAll = ref(false)
const showFilters = ref(false)

// Local shortcut to focus search
onKeyStroke('/', e => {
  const activeElement = window.document.activeElement
  const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

  // Always prevent default to avoid triggering global search
  e.preventDefault()

  if (!isTyping) {
    searchInput.value?.focus()
  }
})

// Admin search should not sync with global store to avoid URL query updates
// Only sync when query is set from store (e.g., from saved queries)
watch(
  () => filters.value.searchQuery,
  newVal => {
    if (newVal !== searchQuery.value) {
      searchQuery.value = newVal
      // Trigger search when query is set from store (e.g., from saved queries)
      if (newVal.length >= 3 || hasActiveFilters.value) {
        debouncedSearch()
      } else {
        results.value = []
      }
    }
  }
)

// Watch for filter changes and trigger search
watch(
  () => [
    filters.value.minRating,
    filters.value.minYear,
    filters.value.maxYear,
    filters.value.minVotes,
    filters.value.maxVotes,
    filters.value.genres,
    filters.value.countries,
    filters.value.sources,
  ],
  () => {
    // Trigger search when filters change
    if (searchQuery.value.length >= 3 || hasActiveFilters.value) {
      debouncedSearch()
    }
  },
  { deep: true }
)

const performSearch = async () => {
  // Allow search with filters even if query is empty
  const hasQuery = searchQuery.value.length >= 3
  const hasFilters = hasActiveFilters.value

  if (!hasQuery && !hasFilters) {
    results.value = []
    return
  }

  isLoading.value = true
  try {
    const data = await $fetch<MovieEntry[]>('/api/admin/movies/search', {
      query: {
        q: searchQuery.value,
        // Pass filters to the API
        minRating: filters.value.minRating || undefined,
        minYear: filters.value.minYear || undefined,
        maxYear: filters.value.maxYear || undefined,
        minVotes: filters.value.minVotes || undefined,
        maxVotes: filters.value.maxVotes || undefined,
        genres: filters.value.genres.join(',') || undefined,
        countries: filters.value.countries.join(',') || undefined,
        sources: filters.value.sources.join(',') || undefined,
      },
    })
    results.value = data.slice(0, 300).map(movieStore.mapMovieToLightweight)
  } catch {
    toastStore.showToast('Search failed', 'error')
  } finally {
    isLoading.value = false
  }
}

const debouncedSearch = useDebounceFn(performSearch, 300)

const onInput = () => {
  debouncedSearch()
}

const isInCollection = (movieId: string) => {
  return collectionsStore.isMovieInCollection(movieId, props.collectionId)
}

const addMovie = async (movieId: string) => {
  isAdding.value = movieId
  try {
    const success = await collectionsStore.addMovieToCollection(props.collectionId, movieId)
    if (success) {
      toastStore.showToast('Movie added to collection')
      emit('add')
    } else {
      toastStore.showToast('Failed to add movie', 'error')
    }
  } catch {
    toastStore.showToast('Error adding movie', 'error')
  } finally {
    isAdding.value = ''
  }
}

const addAllMovies = async () => {
  addingAll.value = true
  let addedCount = 0
  let failedCount = 0

  try {
    // Filter out movies that are already in the collection
    const moviesToAdd = results.value.filter(movie => !isInCollection(movie.imdbId))

    if (moviesToAdd.length === 0) {
      toastStore.showToast('All movies are already in the collection', 'info')
      return
    }

    // Add movies sequentially to avoid overwhelming the API
    for (const movie of moviesToAdd) {
      try {
        const success = await collectionsStore.addMovieToCollection(
          props.collectionId,
          movie.imdbId
        )
        if (success) {
          addedCount++
        } else {
          failedCount++
        }
      } catch {
        failedCount++
      }
    }

    if (addedCount > 0) {
      toastStore.showToast(`Added ${addedCount} movie${addedCount > 1 ? 's' : ''} to collection`)
      emit('add')
    }

    if (failedCount > 0) {
      toastStore.showToast(
        `Failed to add ${failedCount} movie${failedCount > 1 ? 's' : ''}`,
        'error'
      )
    }
  } finally {
    addingAll.value = false
  }
}
</script>
