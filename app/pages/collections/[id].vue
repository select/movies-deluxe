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
import { onBeforeRouteLeave } from 'vue-router'
import { useWindowScroll, useStorage } from '@vueuse/core'

const route = useRoute()
const movieStore = useMovieStore()
const collectionsStore = useCollectionsStore()

const { fetchMoviesByIds, loadFromFile } = movieStore
const { getCollectionById } = collectionsStore

const collection = ref<Collection | null>(null)
const movies = ref<MovieEntry[]>([])
const isLoading = ref(true)

// Track window scroll position
const { y: windowScrollY } = useWindowScroll()
const scrollPositions = useStorage<Record<string, number>>('movies-deluxe-collection-scroll', {})

onMounted(async () => {
  const id = route.params.id as string
  if (!id) return

  isLoading.value = true
  try {
    // Initialize database first
    await loadFromFile()

    // Get collection from cache (loads if not loaded yet)
    collection.value = await getCollectionById(id)

    // Fetch movies using movie store (which uses embedded collection data)
    if (collection.value?.movieIds && collection.value.movieIds.length > 0) {
      movies.value = await fetchMoviesByIds(collection.value.movieIds)
    }

    // Restore scroll position
    await nextTick()
    await nextTick()

    const savedScrollY = scrollPositions.value[id]
    if (savedScrollY && savedScrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' })
      })
    }
  } catch {
    // Error loading collection - handled silently
  } finally {
    isLoading.value = false
  }
})

// Save scroll position before leaving
onBeforeRouteLeave(() => {
  const id = route.params.id as string
  if (id) {
    scrollPositions.value[id] = windowScrollY.value
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
