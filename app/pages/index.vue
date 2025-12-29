<template>
  <!-- Main Content -->
  <main class="md:ml-16">
        <div class="px-4 lg:px-[6%] py-8">
          <MovieStats
            v-if="!isInitialLoading && safeTotalMovies > 0"
            :total-movies="safeTotalMovies"
          />
        </div>

        <div class="relative">
          <template v-if="isInitialLoading">
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-4 lg:px-[6%]">
              <MovieCardSkeleton
                v-for="i in 12"
                :key="i"
              />
            </div>
          </template>

          <template v-else-if="currentMovieList.length > 0">
            <MovieVirtualGrid
              :movies="currentMovieList"
              :total-movies="safeTotalMovies"
              @load-more="loadMore"
            />
          </template>

          <div
            v-else
            class="text-center py-12"
          >
            <p class="text-gray-600 dark:text-gray-400">
              No movies found.
            </p>
          </div>
        </div>
      </main>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'

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
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more - all legally available to watch online.',
    },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Movies Deluxe - Free Public Domain Movies' },
    {
      name: 'twitter:description',
      content:
        'Discover thousands of free public domain movies from Archive.org and YouTube. Classic films, documentaries, and more - all legally available to watch online.',
    },
  ],
})

const { isInitialLoading, currentMovieList, totalFiltered, filters } = storeToRefs(useMovieStore())
const { loadFromFile, setCurrentPage, setScrollY } = useMovieStore()

const safeTotalMovies = computed(() => totalFiltered.value || 0)

// Track window scroll position
const { y: windowScrollY } = useWindowScroll()

// Load movies on mount
onMounted(async () => {
  await loadFromFile()
  
  // Restore scroll position after content loads
  await nextTick()
  if (filters.value.lastScrollY > 0) {
    window.scrollTo({ top: filters.value.lastScrollY, behavior: 'instant' })
  }
})

// Save scroll position before leaving
onBeforeRouteLeave(() => {
  setScrollY(windowScrollY.value)
})

// Load more movies
const loadMore = () => {
  setCurrentPage(filters.value.currentPage + 1)
}
</script>

<style scoped>
/* No extra styles needed for now */
</style>
