<template>
  <div
    ref="gridRef"
    class="w-full"
  >
    <!-- Spacer for rows before visible range -->
    <div
      v-if="visibleRows.length > 0 && visibleRows[0] && visibleRows[0].index > 0"
      :style="{ height: `${visibleRows[0].top}px` }"
    />

    <!-- Visible rows -->
    <div
      v-for="row in visibleRows"
      :key="row.index"
      :ref="row.index === 0 ? (el) => firstRowRef = el as HTMLElement : undefined"
      class="grid gap-4 px-4 lg:px-[6%] mb-4"
      :class="gridClass"
    >
      <!-- Show placeholder or full card based on debounced load state -->
      <template
        v-for="movie in row.movies"
        :key="movie.imdbId"
      >
        <MovieCardPlaceholder
          v-if="!fullyLoadedCards.has(movie.imdbId)"
          :title="movie.title"
        />
        <MovieCard
          v-else
          :movie="getMovieEntry(movie)"
        />
      </template>
    </div>

    <!-- Spacer for rows after visible range -->
    <div
      v-if="visibleRows.length > 0 && visibleRows[visibleRows.length - 1]"
      :style="{ height: `${totalHeight - (visibleRows[visibleRows.length - 1]!.top + rowHeight)}px` }"
    />
  </div>
</template>

<script setup lang="ts">
import { useBreakpoints, breakpointsTailwind, useWindowScroll, useWindowSize, useElementSize } from '@vueuse/core'
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
const { height: windowHeight, width: windowWidth } = useWindowSize()
const breakpoints = useBreakpoints(breakpointsTailwind)

// Map to store loaded movie details
const loadedMovies = ref<Map<string, MovieEntry>>(new Map())
const loadingIds = ref<Set<string>>(new Set())

// Track which cards should show full content
const fullyLoadedCards = ref<Set<string>>(new Set())

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

// Reference to first rendered row for measurement
const firstRowRef = ref<HTMLElement | null>(null)
const { height: firstRowHeight } = useElementSize(firstRowRef)

// Calculate row height dynamically - use measured height if available, otherwise estimate
const rowHeight = computed(() => {
  // Use measured height from first row if available (includes mb-4)
  if (firstRowHeight.value > 0) {
    return firstRowHeight.value + 16 // Add mb-4 (16px) margin
  }

  // Fallback estimation based on screen width
  const w = windowWidth.value || 1024

  // Account for padding (px-4 = 32px, lg:px-[6%] varies)
  const horizontalPadding = breakpoints.lg.value ? w * 0.12 : 32
  const availableWidth = w - horizontalPadding

  // Calculate card width (subtract gaps between cards)
  const gapWidth = 16 // gap-4 = 16px
  const totalGaps = (cols.value - 1) * gapWidth
  const cardWidth = (availableWidth - totalGaps) / cols.value

  // Card height = poster height (width * 1.5 for 2:3 ratio) + info section (80px) + row margin (16px)
  const posterHeight = cardWidth * 1.5
  const infoHeight = 80
  const rowMargin = 16 // mb-4

  return Math.ceil(posterHeight + infoHeight + rowMargin)
})

const buffer = 3 // Number of rows to render above/below viewport

// Use currently loaded movies for virtual scroll calculations, not total
const totalRows = computed(() => Math.ceil(props.movies.length / cols.value))
const totalHeight = computed(() => totalRows.value * rowHeight.value)

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

  const startRow = Math.max(0, Math.floor(relativeScrollTop / rowHeight.value) - buffer)
  const endRow = Math.min(
    totalRows.value - 1,
    Math.ceil((relativeScrollTop + windowHeight.value) / rowHeight.value) + buffer
  )

  const rows = []
  for (let i = startRow; i <= endRow; i++) {
    const startIndex = i * cols.value
    const rowMovies = props.movies.slice(startIndex, startIndex + cols.value)

    if (rowMovies.length > 0) {
      rows.push({
        index: i,
        top: i * rowHeight.value,
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

  if (idsToLoad.length === 0) {
    // All visible movies are already loaded, mark them as fully loaded
    newIds.forEach(id => {
      if (loadedMovies.value.has(id)) {
        fullyLoadedCards.value.add(id)
      }
    })
    return
  }

  // Mark as loading
  idsToLoad.forEach(id => loadingIds.value.add(id))

  try {
    const movies = await movieStore.fetchMoviesByIds(idsToLoad)
    movies.forEach(movie => {
      loadedMovies.value.set(movie.imdbId, movie)
      // Mark as fully loaded immediately after loading
      fullyLoadedCards.value.add(movie.imdbId)
    })
  } catch (err) {
    window.console.error('Failed to load movie details:', err)
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

// Load more when approaching end of currently loaded content
watch(visibleRows, () => {
  if (!props.hasMore) return
  
  // Calculate rows based on currently loaded movies, not total
  const loadedRows = Math.ceil(props.movies.length / cols.value)
  
  // Check if we're rendering the last few rows of loaded content
  const lastVisibleRow = visibleRows.value[visibleRows.value.length - 1]
  if (lastVisibleRow && lastVisibleRow.index >= loadedRows - buffer - 1) {
    window.console.log('[VirtualGrid] Load more triggered - lastVisibleRow:', lastVisibleRow.index, 'loadedRows:', loadedRows, 'buffer:', buffer)
    emit('load-more')
  }
}, { deep: true })
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
