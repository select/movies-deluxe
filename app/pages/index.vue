<template>
  <main class="md:ml-16">
    <div class="px-4 lg:px-[6%] pb-12 space-y-12">
      <!-- Welcome Header -->
      <header class="space-y-4">
        <p class="text-xl text-theme-textmuted max-w-2xl leading-relaxed">
          Discover
          <span class="h-6 relative inline-block w-32 text-center">
            <span
              :class="[
                'inline-block transition-opacity duration-1000 ease-in-out absolute inset-0',
                isShowingNumber ? 'opacity-100' : 'opacity-0',
              ]"
            >
              {{ totalMovies.toLocaleString() }}
            </span>
            <span
              :class="[
                'inline-block transition-opacity duration-1000 ease-in-out absolute inset-0',
                isShowingNumber ? 'opacity-0' : 'opacity-100',
              ]"
            >
              thousands of
            </span>
          </span>
          free movies from Archive.org and YouTube. Classic films, documentaries, and more - all
          legally available to watch online.
        </p>
      </header>

      <!-- Collections Showcase -->
      <div v-if="pending" class="space-y-12">
        <div v-for="i in 3" :key="i" class="space-y-4 px-4">
          <div class="h-8 w-48 bg-theme-selection animate-pulse rounded-lg"></div>
          <div class="flex gap-4 overflow-hidden">
            <div v-for="j in 6" :key="j" class="w-[200px] flex-shrink-0">
              <MovieCardSkeleton />
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="error"
        class="text-center py-12 bg-theme-surface rounded-2xl border border-theme-border/50"
      >
        <div class="i-mdi-alert-circle text-4xl text-red-500 mb-4"></div>
        <h2 class="text-xl font-bold mb-2">Failed to load home page</h2>
        <p class="text-theme-textmuted mb-6">There was an error loading today's collections.</p>
        <button
          class="px-6 py-2 bg-theme-accent text-black font-bold rounded-full hover:bg-theme-accent/80 transition-colors"
          @click="() => refresh()"
        >
          Try Again
        </button>
      </div>

      <div v-else-if="homeData" class="space-y-12">
        <HomeCollectionRow
          v-for="collection in homeData.collections"
          :key="collection.id"
          :collection="collection"
        />

        <!-- Discover More Section -->
        <section
          class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-12 border-t border-theme-border/30"
        >
          <!-- Collections Link -->
          <NuxtLink
            to="/collections"
            class="group p-8 rounded-2xl bg-theme-surface border border-theme-border/50 hover:border-theme-accent transition-all duration-300 flex flex-col items-start space-y-4"
          >
            <div
              class="p-3 rounded-xl bg-theme-accent/10 text-theme-accent group-hover:bg-theme-accent group-hover:text-black transition-colors duration-300"
            >
              <div class="i-mdi:movie-roll text-2xl"></div>
            </div>
            <div class="space-y-2 text-left">
              <h3 class="text-xl font-bold">Browse Collections</h3>
              <p class="text-theme-textmuted">
                Explore our curated sets of movies, from silent film masterpieces to cult classics
                and noir thrillers.
              </p>
            </div>
            <div
              class="flex items-center text-theme-accent font-medium pt-2 group-hover:translate-x-1 transition-transform"
            >
              View all collections
              <div class="i-mdi-arrow-right ml-1"></div>
            </div>
          </NuxtLink>

          <!-- Search Link -->
          <NuxtLink
            to="/search"
            class="group p-8 rounded-2xl bg-theme-surface border border-theme-border/50 hover:border-theme-accent transition-all duration-300 flex flex-col items-start space-y-4"
          >
            <div
              class="p-3 rounded-xl bg-theme-accent/10 text-theme-accent group-hover:bg-theme-accent group-hover:text-black transition-colors duration-300"
            >
              <div class="i-mdi-magnify text-2xl"></div>
            </div>
            <div class="space-y-2 text-left">
              <h3 class="text-xl font-bold">Search Catalog</h3>
              <p class="text-theme-textmuted">
                Looking for something specific? Search our full library of
                {{ totalMovies.toLocaleString() }} movies by title, year, or genre.
              </p>
            </div>
            <div
              class="flex items-center text-theme-accent font-medium pt-2 group-hover:translate-x-1 transition-transform"
            >
              Start searching
              <div class="i-mdi-arrow-right ml-1"></div>
            </div>
          </NuxtLink>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
interface HomeData {
  day: number
  collections: Array<{
    id: string
    name: string
    movieIds: string[]
  }>
}

// Set page title and meta
useHead({
  title: 'Movies Deluxe - Free Public Domain Movies',
  meta: [
    {
      name: 'description',
      content:
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more - all legally available to watch online.',
    },
    { property: 'og:title', content: 'Movies Deluxe - Free Public Domain Movies' },
    {
      property: 'og:description',
      content:
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more.',
    },
    { property: 'og:type', content: 'website' },
  ],
})

// Load today's data based on day of month
const dayOfMonth = new Date().getDate()
// Ensure day is between 1 and 31
const day = Math.max(1, Math.min(31, dayOfMonth))

const {
  data: homeData,
  pending,
  error,
  refresh,
} = await useFetch<HomeData>(`/data/home/day-${day}.json`)

const movieStore = useMovieStore()
const { isFiltering, totalMovies } = storeToRefs(movieStore)

const _displayText = ref('thousands of')
const isShowingNumber = ref(false)

onMounted(async () => {
  // Initialize DB if needed (totalMovies will be reactive once DB is loaded)
  if (isFiltering.value) {
    await movieStore.loadFromFile()
  }

  // Start animation loop
  setInterval(() => {
    isShowingNumber.value = !isShowingNumber.value
  }, 6000)
})
</script>

<style scoped>
/* No extra styles needed for now */
</style>
