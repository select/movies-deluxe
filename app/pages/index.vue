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
            <p class="text-theme-textmuted">
              No movies found.
            </p>
          </div>
        </div>
      </main>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { useStorage, useWindowScroll } from '@vueuse/core'

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

// Save the page number in localStorage (not part of filters to avoid triggering refetch)
const savedPage = useStorage('movies-deluxe-saved-page', 1, localStorage)

// Load movies on mount
onMounted(async () => {
  // Restore the saved page before loading
  if (savedPage.value > 1) {
    setCurrentPage(savedPage.value)
  }

  await loadFromFile()

  // Restore scroll position after content loads
  // Need multiple nextTick calls to wait for virtual grid to render
  await nextTick()
  await nextTick()

  const savedScrollY = filters.value.lastScrollY
  if (savedScrollY > 0) {
    // Use requestAnimationFrame to ensure DOM is fully painted
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollY, behavior: 'instant' })

      // Verify scroll happened, retry if needed
      setTimeout(() => {
        if (Math.abs(window.scrollY - savedScrollY) > 10) {
          window.scrollTo({ top: savedScrollY, behavior: 'instant' })
        }
      }, 50)
    })
  }
})

// Save scroll position and page before leaving
onBeforeRouteLeave(() => {
  setScrollY(windowScrollY.value)
  savedPage.value = filters.value.currentPage
})

// Load more movies
const loadMore = () => {
  setCurrentPage(filters.value.currentPage + 1)
}
</script>

<style scoped>
/* No extra styles needed for now */
</style>
