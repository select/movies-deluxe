<template>
  <div class="space-y-4">
    <div v-if="isLoading" class="p-12 flex justify-center">
      <div class="i-mdi-loading animate-spin text-4xl text-blue-600"></div>
    </div>

    <div v-else-if="movies.length > 0" class="overflow-hidden divide-y divide-theme-border">
      <div
        v-for="movie in movies"
        :key="movie.imdbId"
        class="py-4 flex items-center gap-4 hover:bg-theme-bg/50 transition-colors"
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
          class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title="Remove from collection"
          :disabled="isRemoving === movie.imdbId"
          @click="removeMovie(movie)"
        >
          <div v-if="isRemoving === movie.imdbId" class="i-mdi-loading animate-spin text-xl"></div>
          <div v-else class="i-mdi-trash-can-outline text-xl"></div>
        </button>
      </div>
    </div>

    <div
      v-else
      class="p-12 text-center text-theme-textmuted bg-theme-surface border border-theme-border border-dashed rounded-2xl"
    >
      <div class="i-mdi-movie-off-outline text-4xl mx-auto mb-2 opacity-20"></div>
      <p>No movies in this collection yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  collectionId: string
}>()

const collectionsStore = useCollectionsStore()
const movieStore = useMovieStore()
const { lightweightMovieCache } = storeToRefs(movieStore)
const toastStore = useToastStore()
const movies = ref<LightweightMovie[]>([])
const isLoading = ref(false)
const isRemoving = ref('')

const loadCollectionMovies = async () => {
  if (!props.collectionId) return

  isLoading.value = true
  try {
    const collection = await collectionsStore.getCollectionById(props.collectionId)
    if (!collection || !collection.movieIds || !collection.movieIds.length) {
      movies.value = []
      return
    }

    // Database will already be ready thanks to the splash screen plugin

    // Use toRaw to avoid Proxy cloning issues with Web Workers
    const movieIds = toRaw(collection.movieIds)
    await movieStore.fetchMoviesByIds(movieIds)

    // Get movies from cache and sort by the order in movieIds
    movies.value = movieIds.map((id: string) => {
      const found = lightweightMovieCache.value.get(id)
      if (found) return found
      // Return a placeholder for missing movies so they can be removed
      return {
        imdbId: id,
        title: `Missing: ${id}`,
        year: 0,
      } as LightweightMovie
    })
  } catch (err) {
    window.console.error('Failed to load collection movies:', err)
    toastStore.showToast('Failed to load collection movies', 'error')
  } finally {
    isLoading.value = false
  }
}

const removeMovie = async (movie: LightweightMovie) => {
  if (!confirm(`Remove "${movie.title}" from this collection?`)) return

  isRemoving.value = movie.imdbId
  try {
    const success = await collectionsStore.removeMovieFromCollection(
      props.collectionId,
      movie.imdbId
    )
    if (success) {
      toastStore.showToast('Movie removed from collection')
      await loadCollectionMovies()
    } else {
      toastStore.showToast('Failed to remove movie', 'error')
    }
  } catch {
    toastStore.showToast('Error removing movie', 'error')
  } finally {
    isRemoving.value = ''
  }
}

defineExpose({
  refresh: loadCollectionMovies,
})

watch(
  () => props.collectionId,
  () => {
    loadCollectionMovies()
  },
  { immediate: true }
)
</script>
