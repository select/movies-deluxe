<template>
  <main class="md:ml-16">
    <div class="px-4 lg:px-[6%] py-8">
      <!-- Breadcrumbs -->
      <nav class="flex mb-6 text-sm font-medium text-theme-textmuted">
        <NuxtLink
          to="/collections"
          class="hover:text-theme-accent transition-colors flex items-center gap-1"
        >
          <div class="i-mdi:movie-roll" />
          Collections
        </NuxtLink>
        <span class="mx-2 opacity-50">/</span>
        <span class="text-theme-text truncate">{{ collection?.name || 'Loading...' }}</span>
      </nav>

      <!-- Page Header -->
      <div
        v-if="collection"
        class="mb-10"
      >
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div class="flex-1">
            <h1 class="text-4xl font-black text-theme-text mb-3 tracking-tight">
              {{ collection.name }}
            </h1>
            <p class="text-lg text-theme-textmuted max-w-3xl leading-relaxed">
              {{ collection.description }}
            </p>
          </div>
          <div class="flex flex-col items-start md:items-end gap-2">
            <div class="px-4 py-2 rounded-xl bg-theme-surface border border-theme-border/50 text-sm font-bold shadow-sm">
              {{ collection.movieIds.length }} movies
            </div>
            <div
              v-if="hasActiveFilters"
              class="text-xs text-theme-accent font-bold"
            >
              {{ filteredMovies.length }} matching filters
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
      >
        <MovieCardSkeleton
          v-for="i in 12"
          :key="i"
        />
      </div>

      <!-- Movies Grid -->
      <template v-else-if="filteredMovies.length > 0">
        <MovieGrid :movies="filteredMovies" />
      </template>

      <!-- Empty State / No Results -->
      <div
        v-else
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="i-mdi-movie-open-outline text-6xl text-theme-textmuted mb-4 opacity-20" />
        <h3 class="text-xl font-bold text-theme-text mb-2">
          {{ hasActiveFilters ? 'No movies match your filters' : 'No movies in this collection' }}
        </h3>
        <p class="text-theme-textmuted mb-8">
          {{ hasActiveFilters ? 'Try adjusting your search or filter criteria.' : 'This collection is currently empty.' }}
        </p>
        <button
          v-if="hasActiveFilters"
          class="px-6 py-2.5 rounded-xl bg-theme-accent text-black font-bold hover:scale-105 transition-transform"
          @click="resetFilters"
        >
          Clear Filters
        </button>
        <NuxtLink
          v-else
          to="/"
          class="px-6 py-2.5 rounded-xl bg-theme-accent text-black font-bold hover:scale-105 transition-transform"
        >
          Browse All Movies
        </NuxtLink>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
const route = useRoute()
const movieStore = useMovieStore()
const collectionsStore = useCollectionsStore()

const { applyFilters, resetFilters, fetchMoviesByIds, loadFromFile } = movieStore
const { hasActiveFilters } = storeToRefs(movieStore)
const { getCollectionById } = collectionsStore

const collection = ref<Collection | null>(null)
const movies = ref<MovieEntry[]>([])
const isLoading = ref(true)

const filteredMovies = computed(() => {
  return applyFilters(movies.value)
})

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
  } catch {
    // Error loading collection - handled silently
  } finally {
    isLoading.value = false
  }
})

useHead({
  title: computed(() => `${collection.value?.name || 'Collection'} - Movies Deluxe`),
  meta: [
    { name: 'description', content: computed(() => collection.value?.description || 'Movie collection.') }
  ]
})
</script>
