<template>
  <!-- Main Content -->
  <main class="md:ml-16">
      <div class="px-4 lg:px-[6%] py-8">
        <!-- Header with Search -->
        <div class="mb-10 flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div class="flex-1">
            <h1 class="text-3xl font-bold mb-2 flex items-center gap-3 text-theme-text">
              <div class="i-mdi-heart text-theme-accent" />
              Liked Movies
            </h1>
            <p class="text-theme-textmuted">
              Your personal collection of favorite movies
            </p>
          </div>

          <!-- Search Bar -->
          <div v-if="likedCount > 0" class="flex flex-col items-start md:items-end gap-4 w-full md:w-auto">
            <div class="flex flex-col items-start md:items-end gap-1">
              <div class="px-4 py-2 rounded-xl bg-theme-surface border border-theme-border/50 text-sm font-bold shadow-sm">
                {{ likedCount }} movies
              </div>
              <div v-if="searchQuery && likedCount > 0" class="text-xs text-theme-accent font-bold px-1">
                {{ filteredLikedMovies.length === 0 ? 'No movies found' : `Found ${filteredLikedMovies.length} movie${filteredLikedMovies.length === 1 ? '' : 's'}` }}
              </div>
            </div>

            <div class="relative w-full md:w-64 md:flex-shrink-0">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div class="i-mdi-magnify text-lg text-theme-textmuted" />
              </div>
              <input
                v-model="searchQuery"
                type="text"
                class="block w-full pl-10 pr-10 py-2 bg-theme-surface/50 border border-theme-border/50 focus:border-theme-primary rounded-full text-sm text-theme-text placeholder-theme-textmuted focus:outline-none transition-all focus:bg-theme-surface"
                placeholder="Search liked movies..."
              >
              <button
                v-if="searchQuery"
                class="absolute inset-y-0 right-0 pr-3 flex items-center"
                @click="searchQuery = ''"
              >
                <div class="i-mdi-close text-base text-theme-textmuted hover:text-theme-text transition-colors" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="likedCount === 0" class="text-center py-16">
          <div class="i-mdi-heart-outline text-6xl text-theme-border mb-4" />
          <h2 class="text-xl font-semibold mb-2 text-theme-text">No liked movies yet</h2>
          <p class="text-theme-textmuted mb-6">
            Start exploring movies and click the heart icon to add them to your favorites
          </p>
          <NuxtLink
            to="/"
            class="btn-primary inline-flex items-center gap-2"
          >
            <div class="i-mdi-magnify" />
            Browse Movies
          </NuxtLink>
        </div>

        <!-- Movies Grid -->
        <template v-else-if="filteredLikedMovies.length > 0">
          <MovieStats
            v-if="!isLoadingLiked"
            :total-movies="likedCount"
            :filtered-movies="filteredLikedMovies.length"
          />

          <div class="relative">
            <template v-if="isLoadingLiked">
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <MovieCardSkeleton
                  v-for="i in 12"
                  :key="i"
                />
              </div>
            </template>

            <template v-else>
              <MovieVirtualGrid 
                :movies="filteredLikedMovies" 
                :total-movies="filteredLikedMovies.length"
              />
            </template>
          </div>
        </template>

        <!-- No Results After Filtering/Searching -->
        <div v-else-if="likedCount > 0 && filteredLikedMovies.length === 0" class="text-center py-12">
          <div class="i-mdi-filter-remove text-4xl text-theme-border mb-4" />
          <h2 class="text-xl font-semibold mb-2 text-theme-text">
            {{ searchQuery ? 'No movies found' : 'No movies in your liked collection' }}
          </h2>
          <p class="text-theme-textmuted mb-6">
            {{ searchQuery ? 'Try a different search term or clear your search' : 'Try a different search term' }}
          </p>
          <div class="flex justify-center">
            <button
              v-if="searchQuery"
              class="btn-secondary"
              @click="searchQuery = ''"
            >
              Clear Search
            </button>
          </div>
        </div>
      </div>
    </main>
</template>

<script setup lang="ts">
import Fuse from 'fuse.js'

// Set page title and meta
useHead({
  title: 'Liked Movies - Movies Deluxe',
  meta: [
    {
      name: 'description',
      content: 'Your personal collection of favorite movies from Movies Deluxe.',
    },
    { property: 'og:title', content: 'Liked Movies - Movies Deluxe' },
    {
      property: 'og:description',
      content: 'Your personal collection of favorite movies from Movies Deluxe.',
    },
  ],
})

const movieStore = useMovieStore()
const { loadFromFile, fetchMoviesByIds } = movieStore

// Get likedMovieIds directly from store (VueUse storage)
const { likedMovieIds, likedCount } = storeToRefs(movieStore)

// Local state for liked movies (since store uses lazy loading)
const likedMoviesData = ref<MovieEntry[]>([])
const isLoadingLiked = ref(true)

// Search functionality
const searchQuery = ref('')

// Initialize database and load liked movies
onMounted(async () => {
  try {
    // Initialize database if not already loaded
    await loadFromFile()

    // Fetch full movie details for liked IDs from VueUse storage
    if (likedMovieIds.value.length > 0) {
      // Convert readonly array to mutable array for fetchMoviesByIds
      likedMoviesData.value = await fetchMoviesByIds([...likedMovieIds.value])
    }
  } catch {
    // Failed to load liked movies, continue with empty state
  } finally {
    isLoadingLiked.value = false
  }
})

// Filtered liked movies - only apply search, no global filters
const filteredLikedMovies = computed(() => {
  // Start with all liked movies (no global filters applied)
  let filtered = likedMoviesData.value
  
  // Apply local search if there's a search query
  if (searchQuery.value.trim()) {
    const fuse = new Fuse(filtered, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'metadata.Genre', weight: 1 },
        { name: 'metadata.Director', weight: 1.5 },
        { name: 'metadata.Actors', weight: 1 },
        { name: 'metadata.Plot', weight: 0.5 }
      ],
      threshold: 0.3,
      ignoreLocation: true
    })
    
    const results = fuse.search(searchQuery.value)
    filtered = results.map(result => result.item)
  }
  
  return filtered
})
</script>
