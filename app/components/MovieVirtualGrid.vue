<template>
  <div
    ref="gridRef"
    :style="{ height: `${totalHeight}px`, position: 'relative' }"
    class="w-full"
  >
    <div
      v-for="row in visibleRows"
      :key="row.index"
      :style="{
        position: 'absolute',
        top: `${row.top}px`,
        left: 0,
        right: 0,
        height: `${rowHeight}px`
      }"
      class="grid gap-4 px-4 lg:px-[6%]"
      :class="gridClass"
    >
      <MovieCard
        v-for="movie in row.movies"
        :key="movie.imdbId"
        :movie="getMovieEntry(movie)"
      />
    </div>

    <!-- Loading Sentinel for Infinite Scroll -->
    <div
      v-if="hasMore"
      :style="{
        position: 'absolute',
        top: `${totalHeight}px`,
        left: 0,
        right: 0
      }"
      class="text-center py-8"
    >
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Loading more movies...
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useBreakpoints, breakpointsTailwind, useWindowScroll, useWindowSize } from '@vueuse/core'
import type { MovieEntry, LightweightMovieEntry } from '~/types'

const props = defineProps<{
  movies: LightweightMovieEntry[]
  totalMovies: number
  hasMore: boolean
}>()

const emit = defineEmits<{
  (e: 'load-more'): void
}>()

const movieStore = useMovieStore()
const { y: windowScrollY } = useWindowScroll()
const { height: windowHeight } = useWindowSize()
const breakpoints = useBreakpoints(breakpointsTailwind)

// Map to store loaded movie details
const loadedMovies = ref<Map<string, MovieEntry>>(new Map())
const loadingIds = ref<Set<string>>(new Set())

const cols = computed(() => {
  if (breakpoints.xl.value) return 6
  if (breakpoints.lg.value) return 5
  if (breakpoints.md.value) return 4
  if (breakpoints.sm.value) return 3
  return 2
})

const gridClass = computed(() => {
  if (breakpoints.xl.value) return 'grid-cols-6'
  if (breakpoints.lg.value) return 'grid-cols-5'
  if (breakpoints.md.value) return 'grid-cols-4'
  if (breakpoints.sm.value) return 'grid-cols-3'
  return 'grid-cols-2'
})

// Approximate height of a MovieCard + gap
const rowHeight = 420 
const buffer = 3 // Number of rows to render above/below viewport

const totalRows = computed(() => Math.ceil(props.totalMovies / cols.value))
const totalHeight = computed(() => totalRows.value * rowHeight)

// We need to account for the offset of the grid from the top of the page
const gridOffsetTop = ref(0)
const gridRef = ref<HTMLElement | null>(null)

const updateOffset = () => {
  if (gridRef.value) {
    const rect = gridRef.value.getBoundingClientRect()
    gridOffsetTop.value = rect.top + window.scrollY
  }
}

onMounted(() => {
  updateOffset()
  window.addEventListener('resize', updateOffset)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateOffset)
})

const visibleRows = computed(() => {
  if (!props.movies || props.movies.length === 0) {
    return []
  }

  const relativeScrollTop = Math.max(0, windowScrollY.value - gridOffsetTop.value)
  
  const startRow = Math.max(0, Math.floor(relativeScrollTop / rowHeight) - buffer)
  const endRow = Math.min(
    totalRows.value - 1,
    Math.ceil((relativeScrollTop + windowHeight.value) / rowHeight) + buffer
  )

  const rows = []
  for (let i = startRow; i <= endRow; i++) {
    const startIndex = i * cols.value
    const rowMovies = props.movies.slice(startIndex, startIndex + cols.value)
    
    if (rowMovies.length > 0) {
      rows.push({
        index: i,
        top: i * rowHeight,
        movies: rowMovies
      })
    }
  }
  return rows
})

// Get visible movie IDs
const visibleMovieIds = computed(() => {
  const ids = new Set<string>()
  visibleRows.value.forEach(row => {
    row.movies.forEach(movie => {
      ids.add(movie.imdbId)
    })
  })
  return Array.from(ids)
})

// Lazy load movie details for visible items
watch(visibleMovieIds, async (newIds) => {
  // Filter out IDs that are already loaded or being loaded
  const idsToLoad = newIds.filter(id => 
    !loadedMovies.value.has(id) && !loadingIds.value.has(id)
  )

  if (idsToLoad.length === 0) return

  // Mark as loading
  idsToLoad.forEach(id => loadingIds.value.add(id))

  try {
    const movies = await movieStore.fetchMoviesByIds(idsToLoad)
    movies.forEach(movie => {
      loadedMovies.value.set(movie.imdbId, movie)
    })
  } catch (err) {
    console.error('Failed to load movie details:', err)
  } finally {
    // Remove from loading set
    idsToLoad.forEach(id => loadingIds.value.delete(id))
  }
}, { immediate: true })

// Get full movie entry or create a placeholder
const getMovieEntry = (lightweight: LightweightMovieEntry): MovieEntry => {
  const loaded = loadedMovies.value.get(lightweight.imdbId)
  if (loaded) return loaded

  // Return a minimal movie entry as placeholder
  return {
    imdbId: lightweight.imdbId,
    title: lightweight.title,
    year: lightweight.year,
    sources: [],
    lastUpdated: new Date().toISOString(),
  }
}

// Infinite scroll check
watch(windowScrollY, (y) => {
  if (y + windowHeight.value >= document.documentElement.scrollHeight - 1000) {
    if (props.hasMore) {
      emit('load-more')
    }
  }
})
</script>

<style scoped>
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
