<template>
  <div class="space-y-4">
    <div
      v-if="isLoading"
      class="p-12 flex justify-center"
    >
      <div class="i-mdi-loading animate-spin text-4xl text-blue-600" />
    </div>

    <div
      v-else-if="movies.length > 0"
      class="bg-theme-surface border border-theme-border rounded-2xl overflow-hidden divide-y divide-theme-border"
    >
      <div
        v-for="movie in movies"
        :key="movie.imdbId"
        class="p-4 flex items-center gap-4 hover:bg-theme-bg/50 transition-colors"
      >
        <img
          :src="
            movie.metadata?.Poster && movie.metadata?.Poster !== 'N/A'
              ? movie.metadata?.Poster
              : '/placeholder.png'
          "
          class="w-12 h-16 object-cover rounded bg-theme-bg"
          alt=""
        >
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
          class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title="Remove from collection"
          :disabled="isRemoving === movie.imdbId"
          @click="removeMovie(movie)"
        >
          <div
            v-if="isRemoving === movie.imdbId"
            class="i-mdi-loading animate-spin text-xl"
          />
          <div
            v-else
            class="i-mdi-trash-can-outline text-xl"
          />
        </button>
      </div>
    </div>

    <div
      v-else
      class="p-12 text-center text-theme-textmuted bg-theme-surface border border-theme-border border-dashed rounded-2xl"
    >
      <div class="i-mdi-movie-off-outline text-4xl mx-auto mb-2 opacity-20" />
      <p>No movies in this collection yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  collectionId: string
}>()

const collectionsStore = useCollectionsStore()
const uiStore = useUiStore()
const db = useDatabase()
const movies = ref<any[]>([])
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

    if (!db.isReady.value) {
      await db.init()
    }

    const data = await db.queryByIds(collection.movieIds)

    // Sort by the order in movieIds
    movies.value = collection.movieIds
      .map(id => data.find((m: any) => m.imdbId === id))
      .filter(Boolean)
  } catch (err) {
    console.error('Failed to load collection movies:', err)
    uiStore.showToast('Failed to load collection movies', 'error')
  } finally {
    isLoading.value = false
  }
}

const removeMovie = async (movie: any) => {
  if (!confirm(`Remove "${movie.title}" from this collection?`)) return

  isRemoving.value = movie.imdbId
  try {
    const success = await collectionsStore.removeMovieFromCollection(props.collectionId, movie.imdbId)
    if (success) {
      uiStore.showToast('Movie removed from collection')
      await loadCollectionMovies()
    } else {
      uiStore.showToast('Failed to remove movie', 'error')
    }
  } catch {
    uiStore.showToast('Error removing movie', 'error')
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
