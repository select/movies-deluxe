<template>
  <MovieListPage
    :title="collection?.name || 'Loading...'"
    :description="collection?.description || ''"
    :breadcrumbs="{
      parentPath: '/collections',
      parentIcon: 'i-mdi:movie-roll',
      parentLabel: 'Collections',
      currentLabel: collection?.name || 'Loading...',
    }"
    :movies="movies"
    :movie-count="collection?.movieIds?.length || 0"
    :is-loading="isLoading"
    search-placeholder="Search in collection..."
    empty-state-icon="i-mdi-movie-open-outline"
    empty-state-title="No movies in this collection"
    empty-state-description="This collection is currently empty."
    empty-state-button-to="/"
    empty-state-button-text="Browse All Movies"
  />
</template>

<script setup lang="ts">
const route = useRoute()
const collectionsStore = useCollectionsStore()
const movieStore = useMovieStore()

const { getCollectionById } = collectionsStore

const collection = ref<Collection | null>(null)
const movies = ref<LightweightMovie[]>([])
const isLoading = ref(true)

onMounted(async () => {
  const id = route.params.id as string
  if (!id) return

  isLoading.value = true
  try {
    // Get collection from cache (loads if not loaded yet)
    collection.value = await getCollectionById(id)

    // Set lightweight movies with just IDs to allow virtual grid to fetch visible ones
    if (collection.value?.movieIds && collection.value.movieIds.length > 0) {
      movies.value = collection.value.movieIds.map(
        id => ({ imdbId: id, title: '' }) as LightweightMovie
      )

      // Pre-fetch first batch (e.g., first 40 movies) for instant display
      const firstBatch = collection.value.movieIds.slice(0, 30)
      movieStore.fetchMoviesByIds(firstBatch)
    }
  } catch {
    // Error loading collection - handled silently
  } finally {
    isLoading.value = false
  }
})

useHead({
  title: computed(() => `${collection.value?.name || 'Collection'} - Movies Deluxe`),
  meta: [
    {
      name: 'description',
      content: computed(() => collection.value?.description || 'Movie collection.'),
    },
  ],
})
</script>
