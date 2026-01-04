<template>
  <div class="space-y-4">
    <div class="relative">
      <div
        class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-textmuted"
      >
        <div class="i-mdi-magnify text-xl" />
      </div>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search by title, director, writer, plot or IMDb ID..."
        class="block w-full pl-10 pr-3 py-3 border border-theme-border rounded-xl bg-theme-surface focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
        @input="onInput"
      >
      <div
        v-if="isLoading"
        class="absolute inset-y-0 right-0 pr-3 flex items-center"
      >
        <div class="i-mdi-loading animate-spin text-blue-600" />
      </div>
    </div>

    <div
      v-if="results.length > 0"
      class="bg-theme-surface border border-theme-border rounded-2xl overflow-hidden divide-y divide-theme-border"
    >
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
            @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
          >
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
          >
            <div class="i-mdi-movie text-2xl" />
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
            {{ movie.metadata?.Director || 'Unknown Director' }}
          </p>
          <p class="text-[10px] text-theme-textmuted font-mono mt-0.5">
            {{ movie.imdbId }}
          </p>
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
          <div
            v-if="isAdding === movie.imdbId"
            class="i-mdi-loading animate-spin"
          />
          <div
            v-else
            :class="isInCollection(movie.imdbId) ? 'i-mdi-check' : 'i-mdi-plus'"
          />
          {{ isInCollection(movie.imdbId) ? 'Added' : 'Add' }}
        </button>
      </div>
    </div>

    <div
      v-else-if="searchQuery.length >= 3 && !isLoading"
      class="p-8 text-center text-theme-textmuted bg-theme-surface border border-theme-border border-dashed rounded-2xl"
    >
      No movies found for "{{ searchQuery }}"
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  collectionId: string
}>()

const emit = defineEmits<{
  (e: 'add'): void
}>()

const collectionsStore = useCollectionsStore()
const uiStore = useUiStore()
const searchQuery = ref('')
const results = ref<any[]>([])
const isLoading = ref(false)
const isAdding = ref('')

let debounceTimeout: NodeJS.Timeout

const onInput = () => {
  clearTimeout(debounceTimeout)
  if (searchQuery.value.length < 3) {
    results.value = []
    return
  }

  debounceTimeout = setTimeout(performSearch, 300)
}

const performSearch = async () => {
  isLoading.value = true
  try {
    const data = await $fetch<any[]>('/api/admin/movies/search', {
      query: { q: searchQuery.value },
    })
    results.value = data
  } catch {
    uiStore.showToast('Search failed', 'error')
  } finally {
    isLoading.value = false
  }
}

const isInCollection = (movieId: string) => {
  return collectionsStore.isMovieInCollection(movieId, props.collectionId)
}

const addMovie = async (movieId: string) => {
  isAdding.value = movieId
  try {
    const success = await collectionsStore.addMovieToCollection(props.collectionId, movieId)
    if (success) {
      uiStore.showToast('Movie added to collection')
      emit('add')
    } else {
      uiStore.showToast('Failed to add movie', 'error')
    }
  } catch {
    uiStore.showToast('Error adding movie', 'error')
  } finally {
    isAdding.value = ''
  }
}
</script>
