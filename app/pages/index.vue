<template>
  <main class="md:ml-16">
    <div class="px-4 lg:px-[6%] py-12 space-y-12">
      <!-- Welcome Header -->
      <header class="space-y-4">
        <h1 class="text-4xl md:text-5xl font-black text-theme-text tracking-tight">
          Welcome to <span class="text-theme-accent">Movies Deluxe</span>
        </h1>
        <p class="text-xl text-theme-textmuted max-w-2xl leading-relaxed">
          Discover thousands of free public domain movies from Archive.org and YouTube.
          Classic films, documentaries, and more - all legally available to watch online.
        </p>
      </header>

      <!-- Collections Showcase -->
      <div
        v-if="pending"
        class="space-y-12"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="space-y-4 px-4"
        >
          <div class="h-8 w-48 bg-theme-selection animate-pulse rounded-lg" />
          <div class="flex gap-4 overflow-hidden">
            <div
              v-for="j in 6"
              :key="j"
              class="w-[200px] aspect-[2/3] bg-theme-selection animate-pulse rounded-xl flex-shrink-0"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="error"
        class="text-center py-12 bg-theme-surface rounded-2xl border border-theme-border/50"
      >
        <div class="i-mdi-alert-circle text-4xl text-red-500 mb-4" />
        <h2 class="text-xl font-bold mb-2">
          Failed to load home page
        </h2>
        <p class="text-theme-textmuted mb-6">
          There was an error loading today's collections.
        </p>
        <button
          class="px-6 py-2 bg-theme-accent text-black font-bold rounded-full hover:bg-theme-accent/80 transition-colors"
          @click="refresh"
        >
          Try Again
        </button>
      </div>

      <div
        v-else-if="homeData"
        class="space-y-12"
      >
        <HomeCollectionRow
          v-for="collection in homeData.collections"
          :key="collection.id"
          :collection="collection"
        />
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

const { loadFromFile } = useMovieStore()

onMounted(async () => {
  // Still load the database in background as it's needed for components
  await loadFromFile()
})
</script>

<style scoped>
/* No extra styles needed for now */
</style>
