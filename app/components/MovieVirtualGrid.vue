<template>
  <div ref="containerRef" class="relative" :style="{ height: `${totalHeight}px` }">
    <div
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 absolute top-0 left-0 right-0"
      :style="{ transform: `translateY(${offsetY}px)` }"
    >
      <MovieCard
        v-for="movie in visibleMovies"
        :key="movie.imdbId"
        :movie="movie"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWindowScroll, useWindowSize } from '@vueuse/core'
import type { MovieEntry } from '~/types'

const movieStore = useMovieStore()
const filterStore = useFilterStore()

const containerRef = ref<HTMLElement | null>(null)
const { y: windowScrollY } = useWindowScroll()
const { width: windowWidth } = useWindowSize()

// Constants for layout
const ROW_HEIGHT = 380 // Estimated height of a row including gap
const BUFFER_ROWS = 3 // Number of rows to render above/below visible area

const columnCount = computed(() => {
  const w = windowWidth.value
  if (w >= 1280) return 6
  if (w >= 1024) return 5
  if (w >= 768) return 4
  if (w >= 640) return 3
  return 2
})

const totalRows = computed(() => Math.ceil(movieStore.totalCount / columnCount.value))
const totalHeight = computed(() => totalRows.value * ROW_HEIGHT)

const visibleRange = computed(() => {
  if (!containerRef.value) return { start: 0, end: 20 }

  const containerTop = containerRef.value.offsetTop
  const relativeScrollY = Math.max(0, windowScrollY.value - containerTop)
  
  const startRow = Math.floor(relativeScrollY / ROW_HEIGHT)
  const visibleRows = Math.ceil(window.innerHeight / ROW_HEIGHT)
  
  const start = Math.max(0, (startRow - BUFFER_ROWS) * columnCount.value)
  const end = Math.min(
    movieStore.totalCount,
    (startRow + visibleRows + BUFFER_ROWS) * columnCount.value
  )
  
  return { start, end }
})

const offsetY = computed(() => {
  const startRow = Math.floor(visibleRange.value.start / columnCount.value)
  return startRow * ROW_HEIGHT
})

const visibleMovies = ref<MovieEntry[]>([])

// Fetch movies when visible range or filters change
watch(
  [visibleRange, () => filterStore.filters],
  async ([range, filters]) => {
    const limit = range.end - range.start
    if (limit <= 0) return

    const fetched = await movieStore.fetchMovies({
      offset: range.start,
      limit,
      filters,
      sort: filters.sort
    })
    
    visibleMovies.value = fetched
  },
  { immediate: true, deep: true }
)
</script>
