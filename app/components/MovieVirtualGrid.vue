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
        v-for="(movieId, i) in row.movieIds"
        :key="movieId || `skeleton-${row.index}-${i}`"
        :movie-id="movieId"
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
  useDebounceFn,
} from '@vueuse/core'

interface Props {
  // Movie IDs to display
  movieIds: string[]

  // Configuration props
  columnCount?: number
}

const props = defineProps<Props>()
console.log('MovieVirtualGrid loaded', props.movieIds)

const gridRef = ref<HTMLElement | null>(null)
const firstRowRef = ref<HTMLElement | null>(null)

const breakpoints = useBreakpoints(breakpointsTailwind)
const { y: windowScrollY } = useWindowScroll()
const { height: windowHeight, width: windowWidth } = useWindowSize()

// Movie store for cache-based loading
const movieStore = useMovieStore()
const { fetchMoviesByIds } = movieStore

// Total count of movies to display
const totalMovies = computed(() => props.movieIds.length)

// Grid configuration
const cols = computed(() => {
  if (props.columnCount) return props.columnCount
  if (breakpoints.xl.value) return 6
  if (breakpoints.lg.value) return 5
  if (breakpoints.md.value) return 4
  if (breakpoints.sm.value) return 3
  return 2
})

const gridClass = computed(() => {
  if (props.columnCount) return `grid-cols-${props.columnCount}`
  return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
})

// Dynamic row height calculation
const rowHeight = computed(() => {
  // If we have a rendered row, use its height
  if (firstRowRef.value) {
    const rect = firstRowRef.value.getBoundingClientRect()
    return rect.height + 16 // height + mb-4
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

const totalRows = computed(() => Math.ceil(totalMovies.value / cols.value))
const totalHeight = computed(() => totalRows.value * rowHeight.value)

// We need to account for the offset of the grid from the top of the page
const gridOffsetTop = ref(0)

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
  if (totalMovies.value === 0) {
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
    const rowMovieIds = props.movieIds?.slice(startIndex, startIndex + cols.value) || []

    if (rowMovieIds.length > 0) {
      rows.push({
        index: i,
        top: i * rowHeight.value,
        movieIds: rowMovieIds,
      })
    }
  }
  return rows
}

// Use ref instead of computed for debounced updates
const visibleRows = ref(calculateVisibleRows())

// Debounced update of visible rows for smooth scrolling
const updateVisibleRows = useDebounceFn(() => {
  visibleRows.value = calculateVisibleRows()

  // Load movies for visible range
  const visibleIds = visibleRows.value
    .flatMap(row => row.movieIds)
    .filter((id): id is string => id !== null && !!id && id.startsWith('tt'))

  if (visibleIds.length > 0) {
    fetchMoviesByIds(visibleIds).catch(error => {
      console.error('[MovieVirtualGrid] Failed to load visible range:', error)
    })
  }
}, 80) // 80ms debounce for smooth scrolling

// Watch scroll position and trigger debounced update
watch([windowScrollY, windowHeight, rowHeight, cols, totalMovies], () => {
  updateVisibleRows()
})

// Watch for prop changes to reinitialize
watch(
  () => props.movieIds,
  () => {
    if (props.movieIds) {
      visibleRows.value = calculateVisibleRows()

      // Load visible movies
      const visibleIds = visibleRows.value
        .flatMap(row => row.movieIds)
        .filter((id): id is string => id !== null && !!id)

      if (visibleIds.length > 0) {
        fetchMoviesByIds(visibleIds)
      }
    }
  },
  { deep: true }
)

// Initial render
onMounted(async () => {
  // Initialize based on props
  if (props.movieIds) {
    visibleRows.value = calculateVisibleRows()

    // Load initial visible movies
    const visibleIds = visibleRows.value
      .flatMap(row => row.movieIds)
      .filter((id): id is string => id !== null && !!id)

    if (visibleIds.length > 0) {
      fetchMoviesByIds(visibleIds)
    }
  }
})
</script>
