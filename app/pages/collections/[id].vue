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
    :movie-ids="validMovieIds"
    :movie-count="validMovieIds.length"
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
const db = useDatabase()

const { getCollectionById } = collectionsStore

const collection = ref<Collection | null>(null)
const validMovieIds = ref<string[]>([])
const isLoading = ref(true)

// SSR-compatible fetch for prerendering social card meta tags
const { data: seoCollection } = await useAsyncData(
  `collection-seo-${route.params.id}`,
  async () => {
    const data = await $fetch<Record<string, Collection>>('/data/collections.json')
    return data[route.params.id as string] || null
  },
  { server: true, lazy: false }
)

onMounted(async () => {
  const id = route.params.id as string
  if (!id) return

  isLoading.value = true
  try {
    // Get collection from cache (loads if not loaded yet)
    collection.value = await getCollectionById(id)

    // Filter out invalid movie IDs (movies that no longer exist)
    if (collection.value?.movieIds?.length) {
      await db.init()
      const existingMovies = await db.queryByIds(collection.value.movieIds)
      const existingIds = new Set(existingMovies.map(m => m.movieId))
      validMovieIds.value = collection.value.movieIds.filter(id => existingIds.has(id))
    }
  } catch {
    // Error loading collection - handled silently
  } finally {
    isLoading.value = false
  }
})

const {
  public: { siteUrl },
} = useRuntimeConfig()

// Use seoCollection for SSR, falls back to client-loaded collection
const metaCollection = computed(() => collection.value || seoCollection.value)

useHead({
  title: computed(() => `${metaCollection.value?.name || 'Collection'} - Movies Deluxe`),
  meta: [
    {
      name: 'description',
      content: computed(() => metaCollection.value?.description || 'Movie collection.'),
    },
    // Open Graph
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Movies Deluxe' },
    {
      property: 'og:title',
      content: computed(() => `${metaCollection.value?.name || 'Collection'} - Movies Deluxe`),
    },
    {
      property: 'og:description',
      content: computed(() => metaCollection.value?.description || 'Movie collection.'),
    },
    {
      property: 'og:url',
      content: computed(() => `${siteUrl}/collections/${route.params.id}`),
    },
    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    {
      name: 'twitter:title',
      content: computed(() => `${metaCollection.value?.name || 'Collection'} - Movies Deluxe`),
    },
    {
      name: 'twitter:description',
      content: computed(() => metaCollection.value?.description || 'Movie collection.'),
    },
  ],
})
</script>
