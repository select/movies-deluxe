<template>
  <div ref="rowElement" class="space-y-4 group/row">
    <div class="flex items-center justify-between px-4">
      <h2 class="text-xl font-bold text-theme-text flex items-center gap-2">
        <div class="i-mdi-movie-open text-theme-accent"></div>
        {{ collection.name }}
      </h2>
      <NuxtLink
        :to="`/collections/${collection.id}`"
        class="text-sm text-theme-accent hover:underline flex items-center gap-1 font-medium"
      >
        View all
        <div class="i-mdi-chevron-right"></div>
      </NuxtLink>
    </div>

    <div class="relative">
      <!-- Left Scroll Button -->
      <button
        v-if="canScrollLeft"
        class="absolute left-2 top-[calc(50%-2rem)] -translate-y-1/2 z-10 p-2 rounded-full bg-theme-surface/60 border border-theme-border/20 text-theme-text/50 shadow-sm hover:bg-theme-accent hover:text-black hover:border-theme-accent transition-all duration-200 hidden md:flex items-center justify-center opacity-0 group-hover/row:opacity-100 group-hover/row:animate-pulse"
        @click="scroll('left')"
      >
        <div class="i-mdi-chevron-left text-2xl"></div>
      </button>

      <!-- Right Scroll Button -->
      <button
        v-if="canScrollRight"
        class="absolute right-2 top-[calc(50%-2rem)] -translate-y-1/2 z-10 p-2 rounded-full bg-theme-surface/60 border border-theme-border/20 text-theme-text/50 shadow-sm hover:bg-theme-accent hover:text-black hover:border-theme-accent transition-all duration-200 hidden md:flex items-center justify-center opacity-0 group-hover/row:opacity-100 group-hover/row:animate-pulse"
        @click="scroll('right')"
      >
        <div class="i-mdi-chevron-right text-2xl"></div>
      </button>

      <div
        ref="scrollContainer"
        class="flex overflow-x-auto gap-4 px-4 pb-4 pt-2 scroll-smooth hide-scrollbar snap-x snap-mandatory"
        @scroll="updateScrollState"
      >
        <template v-if="isLoading">
          <div v-for="i in 6" :key="i" class="w-[200px] flex-shrink-0 snap-start">
            <MovieCardSkeleton />
          </div>
        </template>
        <template v-else>
          <div
            v-for="movie in displayMovies"
            :key="movie.imdbId"
            class="w-[200px] flex-shrink-0 snap-start"
          >
            <MovieCard :movie-id="movie.imdbId" />
          </div>

          <div class="w-[200px] flex-shrink-0 snap-start">
            <HomeExploreMoreCard
              :collection-id="collection.id"
              :collection-name="collection.name"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import type { LightweightMovie } from '~/types'

interface CollectionData {
  id: string
  name: string
  movieIds: string[]
}

interface Props {
  collection: CollectionData
}

const props = defineProps<Props>()
const { fetchMoviesByIds } = useMovieStore()
const { lightweightMovieCache } = storeToRefs(useMovieStore())

const isLoading = ref(true)
const displayMovies = ref<LightweightMovie[]>([])
const scrollContainer = ref<HTMLElement | null>(null)
const rowElement = ref<HTMLElement | null>(null)
const hasLoaded = ref(false)

const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const updateScrollState = () => {
  if (!scrollContainer.value) return
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value
  // Use a larger threshold to handle sub-pixel rounding and initial offsets
  canScrollLeft.value = scrollLeft > 20
  canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 20
}

const scroll = (direction: 'left' | 'right') => {
  if (!scrollContainer.value) return
  const scrollAmount = scrollContainer.value.clientWidth * 0.8
  scrollContainer.value.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth',
  })
}

const loadMovies = async () => {
  if (hasLoaded.value) return
  if (props.collection.movieIds.length > 0) {
    isLoading.value = true
    // We only show up to 9 movies, then the explore more card
    const movieIds = props.collection.movieIds.slice(0, 9)

    // Fetch movies into cache
    await fetchMoviesByIds(movieIds)

    // Get movies from cache
    displayMovies.value = movieIds
      .map(id => lightweightMovieCache.value.get(id))
      .filter((movie): movie is LightweightMovie => !!movie)

    isLoading.value = false
    hasLoaded.value = true

    // Ensure scroll position is at the left after loading
    nextTick(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollLeft = 0
        updateScrollState()
      }
    })
  } else {
    isLoading.value = false
    hasLoaded.value = true
  }
}

// Lazy load when visible
useIntersectionObserver(rowElement, entries => {
  const entry = entries[0]
  if (entry?.isIntersecting) {
    loadMovies()
  }
})

onMounted(() => {
  // Initial scroll state update
  updateScrollState()
})

// Update scroll state on window resize
if (typeof window !== 'undefined') {
  useEventListener('resize', updateScrollState)
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
