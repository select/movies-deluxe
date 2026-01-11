<template>
  <div ref="gridRef" class="w-full">
    <!-- Spacer for rows before visible range -->
    <div
      v-if="visibleRows.length > 0 && visibleRows[0] && visibleRows[0].index > 0"
      :style="{ height: `${visibleRows[0].top}px` }"
    ></div>

    <!-- Visible rows -->
    <div
      v-for="row in visibleRows"
      :key="row.index"
      :ref="row.index === 0 ? el => (firstRowRef = el as HTMLElement) : undefined"
      class="grid gap-4 mb-4"
      :class="gridClass"
    >
      <MovieCard
        v-for="movie in row.movies"
        :key="movie.imdbId"
        :movie="getMovieWithDetails(movie)"
      />
    </div>

    <!-- Spacer for rows after visible range -->
    <div
      v-if="visibleRows.length > 0 && visibleRows[visibleRows.length - 1]"
      :style="{
        height: `${totalHeight - (visibleRows[visibleRows.length - 1]!.top + rowHeight)}px`,
      }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import {
  useBreakpoints,
  breakpointsTailwind,
  useWindowScroll,
  useWindowSize,
  useElementSize,
  useDebounceFn,
} from '@vueuse/core'
import type { LightweightMovieEntry } from '~/types'

const props = defineProps<{
  movies: LightweightMovieEntry[]
  totalMovies: number
}>()

const emit = defineEmits<{
  (e: 'load-more'): void
}>()

const { y: windowScrollY } = useWindowScroll()
const { height: windowHeight, width: windowWidth } = useWindowSize()
const breakpoints = useBreakpoints(breakpointsTailwind)

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

// Calculate visible rows based on scroll position
const calculateVisibleRows = () => {
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
        movies: rowMovies,
      })
    }
  }
  return rows
}

// Use ref instead of computed for debounced updates
const visibleRows = ref(calculateVisibleRows())

const movieStore = useMovieStore()
const { fetchMoviesByIds } = movieStore
const { movieDetailsCache } = storeToRefs(movieStore)

// Track last fetched IDs to avoid redundant fetches
const lastFetchedIds = ref<Set<string>>(new Set())

/**
 * Get movie with full details from cache, or return lightweight entry
 * This ensures MovieCard receives the full movie data once it's fetched
 */
const getMovieWithDetails = (lightweightMovie: LightweightMovieEntry): LightweightMovieEntry => {
  const cached = movieDetailsCache.value.get(lightweightMovie.imdbId)
  if (cached && cached.title) {
    // Return a merged object with all fields from cached movie
    return {
      imdbId: cached.imdbId,
      title: cached.title,
      year: cached.year,
      imdbRating: cached.metadata?.imdbRating,
      imdbVotes: cached.metadata?.imdbVotes,
      language: cached.metadata?.Language,
      sourceType: cached.sources?.[0]?.type,
      channelName:
        cached.sources?.[0]?.type === 'youtube' ? cached.sources[0].channelName : undefined,
      verified: cached.verified,
    }
  }
  // Return the lightweight entry as-is if not cached yet
  return lightweightMovie
}

// Debounced fetch function to prevent excessive calls during scroll
const debouncedFetch = useDebounceFn((ids: string[]) => {
  // Filter out IDs that are already cached or were just fetched
  const uncachedIds = ids.filter(
    id => !movieDetailsCache.value.has(id) && !lastFetchedIds.value.has(id)
  )

  if (uncachedIds.length > 0) {
    console.log('[MovieVirtualGrid] Fetching', uncachedIds.length, 'uncached movies')
    // Add to last fetched set
    uncachedIds.forEach(id => lastFetchedIds.value.add(id))
    fetchMoviesByIds(uncachedIds)
  }
}, 300) // 300ms debounce

// Debounced update of visible rows for smooth scrolling
const updateVisibleRows = useDebounceFn(() => {
  visibleRows.value = calculateVisibleRows()

  // Calculate rows based on currently loaded movies, not total
  const loadedRows = Math.ceil(props.movies.length / cols.value)

  // Check if we're rendering the last few rows of loaded content
  const lastVisibleRow = visibleRows.value[visibleRows.value.length - 1]
  if (lastVisibleRow && lastVisibleRow.index >= loadedRows - buffer - 1) {
    emit('load-more')
  }

  // Fetch full data for visible rows (debounced)
  const visibleIds = visibleRows.value.flatMap(row => row.movies.map(m => m.imdbId)).filter(Boolean)
  if (visibleIds.length > 0) {
    debouncedFetch(visibleIds)
  }
}, 80) // 80ms debounce for smooth scrolling

// Watch scroll position and trigger debounced update
watch([windowScrollY, windowHeight, rowHeight, cols, () => props.movies.length], () => {
  updateVisibleRows()
})

// Initial render
onMounted(() => {
  visibleRows.value = calculateVisibleRows()
  // Trigger initial fetch
  const visibleIds = visibleRows.value.flatMap(row => row.movies.map(m => m.imdbId)).filter(Boolean)
  if (visibleIds.length > 0) {
    debouncedFetch(visibleIds)
  }
})
</script>
