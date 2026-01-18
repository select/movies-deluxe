<template>
  <div class="space-y-4">
    <AdminSearchHeader :filters="filters" :is-filtering="isLoading" @search="performSearch" />

    <div
      v-if="results.length > 0"
      class="bg-theme-surface border border-theme-border rounded-2xl overflow-hidden"
    >
      <!-- Header with Add All button -->
      <div
        class="p-4 border-b border-theme-border flex items-center justify-between bg-theme-bg/30"
      >
        <div class="text-sm text-theme-textmuted">
          <span class="font-semibold text-theme-text">{{ results.length }}</span>
          {{ isExternalResults ? 'similar movies found' : 'results' }}
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
          :key="movie.movieId"
          class="p-4 flex items-center gap-4 hover:bg-theme-bg/50 transition-colors"
        >
          <div class="w-12 h-16 rounded bg-theme-selection relative overflow-hidden flex-shrink-0">
            <img
              v-if="movie.movieId?.startsWith('tt')"
              :src="getPosterPath(movie.movieId)"
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
                <NuxtLink
                  :to="`/movie/${movie.movieId}`"
                  target="_blank"
                  class="hover:text-blue-600 transition-colors"
                >
                  {{ movie.title }}
                </NuxtLink>
              </h4>
              <span class="text-xs text-theme-textmuted font-mono">{{ movie.year }}</span>
            </div>
            <p class="text-xs text-theme-textmuted truncate">
              {{ movie.genre || 'Unknown Genre' }}
            </p>
            <div class="flex items-center gap-2 text-[10px] text-theme-textmuted mt-0.5">
              <span class="font-mono">{{ movie.movieId }}</span>
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
              isInCollection(movie.movieId)
                ? 'bg-theme-selection text-theme-textmuted cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            "
            :disabled="isInCollection(movie.movieId) || isAdding === movie.movieId"
            @click="addMovie(movie.movieId)"
          >
            <div v-if="isAdding === movie.movieId" class="i-mdi-loading animate-spin"></div>
            <div v-else :class="isInCollection(movie.movieId) ? 'i-mdi-check' : 'i-mdi-plus'"></div>
            {{ isInCollection(movie.movieId) ? 'Added' : 'Add' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-else-if="(filters.searchQuery.length >= 3 || hasActiveFilters) && !isLoading"
      class="p-8 text-center text-theme-textmuted bg-theme-surface border border-theme-border border-dashed rounded-2xl"
    >
      No movies found{{ filters.searchQuery ? ` for "${filters.searchQuery}"` : ''
      }}{{ hasActiveFilters ? ' with current filters' : '' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn, onKeyStroke } from '@vueuse/core'
import type { FilterState } from '~/types'

const props = defineProps<{
  collectionId: string
  filters?: FilterState
}>()

const emit = defineEmits<{
  (e: 'add'): void
}>()

const collectionsStore = useCollectionsStore()
const movieStore = useMovieStore()
const toastStore = useToastStore()

// Use injected filters if available, otherwise use local admin search filters
const injectedFilters = inject(FILTER_STATE_KEY, null)
const { filters: localFilters } = useAdminSearchFilters()

const filters = computed(() => props.filters || injectedFilters?.value || localFilters.value)

const hasActiveFilters = computed(() => {
  const f = filters.value
  return (
    f.sources.length > 0 ||
    f.minRating > 0 ||
    f.minYear > 0 ||
    f.minVotes > 0 ||
    f.genres.length > 0 ||
    f.countries.length > 0
  )
})

const results = ref<LightweightMovie[]>([])
const isLoading = ref(false)
const isAdding = ref('')
const addingAll = ref(false)
const isExternalResults = ref(false)

const setExternalResults = (newResults: LightweightMovie[]) => {
  results.value = newResults
  isExternalResults.value = true
  filters.value.searchQuery = ''
}

// Local shortcut to focus search
onKeyStroke('/', e => {
  const activeElement = window.document.activeElement
  const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

  // Always prevent default to avoid triggering global search
  e.preventDefault()

  if (!isTyping) {
    // Focus the input inside AdminSearchHeader if possible
    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    input?.focus()
  }
})

const performSearch = async () => {
  // Allow search with filters even if query is empty
  const hasQuery = filters.value.searchQuery.length >= 3
  const hasFilters = hasActiveFilters.value

  if (!hasQuery && !hasFilters) {
    results.value = []
    return
  }

  isLoading.value = true
  isExternalResults.value = false

  try {
    let data: MovieEntry[] = []

    if (filters.value.searchMode === 'semantic' && filters.value.searchQuery) {
      // Use vector search composable for semantic search
      const vectorSearch = useVectorSearch()

      const whereConditions: string[] = []
      const whereParams: (string | number)[] = []

      if (filters.value.minRating > 0) {
        whereConditions.push('m.imdbRating >= ?')
        whereParams.push(filters.value.minRating)
      }
      if (filters.value.minYear > 0) {
        whereConditions.push('m.year >= ?')
        whereParams.push(filters.value.minYear)
      }
      if ((filters.value.maxYear ?? 0) > 0) {
        whereConditions.push('m.year <= ?')
        whereParams.push(filters.value.maxYear!)
      }
      if (filters.value.minVotes > 0) {
        whereConditions.push('m.imdbVotes >= ?')
        whereParams.push(filters.value.minVotes)
      }
      if ((filters.value.maxVotes ?? 0) > 0) {
        whereConditions.push('m.imdbVotes <= ?')
        whereParams.push(filters.value.maxVotes!)
      }

      // Add genre filters
      if (filters.value.genres.length > 0) {
        const genreConditions = filters.value.genres.map(
          () => '(m.genre LIKE ? OR m.genre LIKE ? OR m.genre LIKE ? OR m.genre = ?)'
        )
        whereConditions.push(`(${genreConditions.join(' OR ')})`)
        filters.value.genres.forEach((genre: string) => {
          whereParams.push(`${genre},%`, `%, ${genre},%`, `%, ${genre}`, genre)
        })
      }

      // Add country filters
      if (filters.value.countries.length > 0) {
        const countryConditions = filters.value.countries.map(
          () => '(m.country LIKE ? OR m.country LIKE ? OR m.country LIKE ? OR m.country = ?)'
        )
        whereConditions.push(`(${countryConditions.join(' OR ')})`)
        filters.value.countries.forEach((country: string) => {
          whereParams.push(`${country},%`, `%, ${country},%`, `%, ${country}`, country)
        })
      }

      // Add source filters
      if (filters.value.sources.length > 0) {
        const sourceConditions: string[] = []
        filters.value.sources.forEach((source: string) => {
          if (source === 'archive.org') {
            sourceConditions.push('m.primarySourceType = ?')
            whereParams.push('archive.org')
          } else {
            sourceConditions.push('(m.primarySourceType = ? AND m.primaryChannelName = ?)')
            whereParams.push('youtube', source)
          }
        })
        whereConditions.push(`(${sourceConditions.join(' OR ')})`)
      }

      const vectorResults = await vectorSearch.search(
        filters.value.searchQuery,
        300,
        whereConditions.length > 0 ? whereConditions.join(' AND ') : undefined,
        whereConditions.length > 0 ? whereParams : undefined
      )
      data = vectorResults as unknown as MovieEntry[]
    } else {
      // Exact search
      data = await $fetch<MovieEntry[]>('/api/admin/movies/search', {
        query: {
          q: filters.value.searchQuery,
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
    }

    results.value = data.slice(0, 300).map(movieStore.mapMovieToLightweight)
  } catch {
    toastStore.showToast('Search failed', 'error')
  } finally {
    isLoading.value = false
  }
}

const debouncedSearch = useDebounceFn(performSearch, 300)

// Watch for filter changes and trigger search
watch(
  () => filters.value,
  () => {
    debouncedSearch()
  },
  { deep: true }
)

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
    const moviesToAdd = results.value.filter(movie => !isInCollection(movie.movieId))

    if (moviesToAdd.length === 0) {
      toastStore.showToast('All movies are already in the collection', 'info')
      return
    }

    for (const movie of moviesToAdd) {
      try {
        const success = await collectionsStore.addMovieToCollection(
          props.collectionId,
          movie.movieId
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

defineExpose({
  setExternalResults,
})
</script>
