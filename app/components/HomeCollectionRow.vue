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
            :key="movie.movieId"
            class="w-[200px] flex-shrink-0 snap-start"
          >
            <MovieCard :movie-id="movie.movieId" :eager="props.eager" />
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
import { useIntersectionObserver, useEventListener } from '@vueuse/core'
import type { LightweightMovie } from '~/types'
import { useMovieStore } from '~/stores/useMovieStore'
import { storeToRefs } from '#imports'
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import MovieCardSkeleton from '~/components/MovieCardSkeleton.vue'
import MovieCard from '~/components/MovieCard.vue'
import HomeExploreMoreCard from '~/components/HomeExploreMoreCard.vue'
import { NuxtLink } from '#components'

interface CollectionData {
  id: string
  name: string
  movieIds: string[]
  movies?: LightweightMovie[]
}

interface Props {
  collection: CollectionData
  eager?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  eager: false,
})
const movieStore = useMovieStore()
const { fetchMoviesByIds, seedLightweightCache } = movieStore
const { lightweightMovieCache } = storeToRefs(movieStore)

const initialMovieIds = props.collection.movieIds.slice(0, 9)
let initialDisplayMovies: LightweightMovie[] = []
let initiallyLoaded = false

if (props.eager) {
  if (props.collection.movies?.length) {
    seedLightweightCache(props.collection.movies)
  }

  if (initialMovieIds.length === 0) {
    initiallyLoaded = true
  } else {
    const embeddedMap = new Map(
      (props.collection.movies ?? []).map(movie => [movie.movieId, movie])
    )
    const allCovered = initialMovieIds.every(
      id => lightweightMovieCache.value.has(id) || embeddedMap.has(id)
    )
    if (allCovered) {
      initialDisplayMovies = initialMovieIds
        .map(id => lightweightMovieCache.value.get(id) ?? embeddedMap.get(id))
        .filter((movie): movie is LightweightMovie => !!movie)
      initiallyLoaded = initialDisplayMovies.length === initialMovieIds.length
    }
  }
}

const isLoading = ref(!initiallyLoaded)
const displayMovies = ref<LightweightMovie[]>(initialDisplayMovies)
const scrollContainer = ref<HTMLElement | null>(null)
const rowElement = ref<HTMLElement | null>(null)
const hasLoaded = ref(initiallyLoaded)
let isLoadingInFlight = false

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
  if (hasLoaded.value || isLoadingInFlight) return
  isLoadingInFlight = true
  try {
    if (props.collection.movieIds.length > 0) {
      // We only show up to 9 movies, then the explore more card
      const movieIds = props.collection.movieIds.slice(0, 9)

      // Seed cache from embedded collection.movies if not already present
      if (props.collection.movies?.length) {
        seedLightweightCache(props.collection.movies)
      }

      // Only query SQLite for IDs missing from cache
      const missingIds = movieIds.filter(id => !lightweightMovieCache.value.has(id))
      if (missingIds.length > 0) {
        isLoading.value = true
        await fetchMoviesByIds(missingIds)
      }

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
  } finally {
    isLoadingInFlight = false
  }
}

// Lazy load when visible (unless eager)
let stopObserver: (() => void) | null = null
if (!props.eager) {
  const { stop } = useIntersectionObserver(rowElement, entries => {
    const entry = entries[0]
    if (entry?.isIntersecting) {
      stop()
      loadMovies()
    }
  })
  stopObserver = stop
}

onMounted(() => {
  if (props.eager) {
    loadMovies()
  }
  // Initial scroll state update
  updateScrollState()
})

onUnmounted(() => {
  stopObserver?.()
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
