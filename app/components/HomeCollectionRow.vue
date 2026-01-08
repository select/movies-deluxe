<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between px-4">
      <h2 class="text-xl font-bold text-theme-text flex items-center gap-2">
        <div class="i-mdi-movie-open text-theme-accent" />
        {{ collection.name }}
      </h2>
      <NuxtLink
        :to="`/collections/${collection.id}`"
        class="text-sm text-theme-accent hover:underline flex items-center gap-1 font-medium"
      >
        View all
        <div class="i-mdi-chevron-right" />
      </NuxtLink>
    </div>

    <div class="relative group">
      <!-- Left Scroll Button -->
      <button
        v-if="canScrollLeft"
        class="absolute left-2 top-[calc(50%-2rem)] -translate-y-1/2 z-10 p-1.5 rounded-full bg-theme-surface/80 border border-theme-border/30 text-theme-text/70 shadow-sm hover:bg-theme-accent hover:text-black hover:border-theme-accent transition-all duration-200 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100"
        @click="scroll('left')"
      >
        <div class="i-mdi-chevron-left text-xl" />
      </button>

      <!-- Right Scroll Button -->
      <button
        v-if="canScrollRight"
        class="absolute right-2 top-[calc(50%-2rem)] -translate-y-1/2 z-10 p-1.5 rounded-full bg-theme-surface/80 border border-theme-border/30 text-theme-text/70 shadow-sm hover:bg-theme-accent hover:text-black hover:border-theme-accent transition-all duration-200 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100"
        @click="scroll('right')"
      >
        <div class="i-mdi-chevron-right text-xl" />
      </button>

      <div
        ref="scrollContainer"
        class="flex overflow-x-auto gap-4 px-4 pb-4 scroll-smooth hide-scrollbar snap-x snap-mandatory"
        @scroll="updateScrollState"
      >
        <template v-if="isLoading">
          <div
            v-for="i in 6"
            :key="i"
            class="w-[200px] flex-shrink-0 snap-start"
          >
            <MovieCardSkeleton />
          </div>
        </template>
        <template v-else>
          <div
            v-for="movie in displayMovies"
            :key="movie.imdbId"
            class="w-[200px] flex-shrink-0 snap-start"
          >
            <MovieCard :movie="movie" />
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
import type { MovieEntry } from '~/types'

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

const isLoading = ref(true)
const displayMovies = ref<MovieEntry[]>([])
const scrollContainer = ref<HTMLElement | null>(null)

const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const updateScrollState = () => {
  if (!scrollContainer.value) return
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value
  canScrollLeft.value = scrollLeft > 10
  canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 10
}

const scroll = (direction: 'left' | 'right') => {
  if (!scrollContainer.value) return
  const scrollAmount = scrollContainer.value.clientWidth * 0.8
  scrollContainer.value.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth'
  })
}

onMounted(async () => {
  if (props.collection.movieIds.length > 0) {
    isLoading.value = true
    // We only show up to 9 movies, then the explore more card
    const movieIds = props.collection.movieIds.slice(0, 9)
    displayMovies.value = await fetchMoviesByIds(movieIds)
    isLoading.value = false
    
    // Ensure scroll position is at the left after loading
    nextTick(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollLeft = 0
        updateScrollState()
      }
    })
  } else {
    isLoading.value = false
  }
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
