<template>
  <div>
    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 py-8 md:ml-16">
      <!-- Loading State - Skeleton -->
      <div v-if="isLoading" class="space-y-8">
        <!-- Movie Header Skeleton -->
        <div class="flex flex-col md:flex-row gap-8">
          <!-- Poster Skeleton -->
          <div class="flex-shrink-0">
            <div class="w-full md:w-80 aspect-[2/3] skeleton rounded-lg"></div>
          </div>

          <!-- Movie Info Skeleton -->
          <div class="flex-1 space-y-6">
            <!-- Title -->
            <div class="h-10 skeleton rounded-lg w-3/4"></div>

            <!-- Metadata Row -->
            <div class="flex gap-4">
              <div class="h-8 w-20 skeleton rounded-full"></div>
              <div class="h-8 w-16 skeleton rounded-full"></div>
              <div class="h-8 w-24 skeleton rounded-full"></div>
            </div>

            <!-- Rating -->
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 skeleton rounded-full"></div>
              <div class="h-8 w-16 skeleton rounded-md"></div>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3">
              <div class="h-10 w-40 skeleton rounded-full"></div>
              <div class="h-10 w-28 skeleton rounded-full"></div>
            </div>

            <!-- Genre -->
            <div class="space-y-2">
              <div class="h-4 w-16 skeleton rounded-md"></div>
              <div class="flex gap-2">
                <div class="h-8 w-20 skeleton rounded-full"></div>
                <div class="h-8 w-24 skeleton rounded-full"></div>
              </div>
            </div>

            <!-- Plot -->
            <div class="space-y-2">
              <div class="h-4 w-12 skeleton rounded-md"></div>
              <div class="space-y-2">
                <div class="h-4 skeleton rounded-md"></div>
                <div class="h-4 skeleton rounded-md"></div>
                <div class="h-4 skeleton rounded-md w-3/4"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Video Player Skeleton -->
        <div class="aspect-video skeleton rounded-lg"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-12">
        <div class="i-mdi-alert-circle text-6xl text-red-500 mb-4"></div>
        <h2 class="text-2xl font-bold mb-2">Movie Not Found</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ error }}
        </p>
        <NuxtLink
          to="/"
          class="inline-block px-6 py-3 rounded-full bg-gray-700 dark:bg-yellow-600 text-white hover:bg-gray-600 dark:hover:bg-yellow-500 transition-colors"
        >
          Back to Movies
        </NuxtLink>
      </div>

      <!-- Movie Details -->
      <div v-else-if="movie" class="space-y-8 text-theme-text">
        <!-- Movie Header -->
        <div class="flex flex-col md:flex-row gap-8">
          <!-- Poster -->
          <div class="flex-shrink-0">
            <div
              class="w-full md:w-80 aspect-[2/3] bg-theme-selection rounded-lg overflow-hidden border border-theme-border/50"
            >
              <img
                v-if="movie.imdbId?.startsWith('tt')"
                :src="getPosterPath(movie.imdbId)"
                :alt="movie.title"
                class="w-full h-full object-cover object-center"
                @error="handlePosterError"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-theme-textmuted"
              >
                <div class="i-mdi-movie text-8xl"></div>
              </div>
            </div>
          </div>

          <!-- Movie Info -->
          <div class="flex-1">
            <h1 class="text-4xl font-bold mb-4">
              {{ movie.title }}
            </h1>

            <!-- Metadata Row -->
            <div class="flex flex-wrap gap-4 text-sm mb-6">
              <span
                v-if="movie.year"
                class="px-3 py-1 rounded-full bg-theme-surface border border-theme-border/50"
              >
                {{ movie.year }}
              </span>
              <span
                v-if="movie.metadata?.Rated"
                class="px-3 py-1 rounded-full bg-theme-surface border border-theme-border/50"
              >
                {{ movie.metadata.Rated }}
              </span>
              <span
                v-if="movie.metadata?.Runtime"
                class="px-3 py-1 rounded-full bg-theme-surface border border-theme-border/50"
              >
                {{ movie.metadata.Runtime }}
              </span>
            </div>

            <!-- Rating -->
            <div v-if="movie.metadata?.imdbRating" class="flex items-center gap-2 mb-6">
              <div class="i-mdi-star text-theme-accent text-2xl"></div>
              <span class="text-2xl font-bold">{{ movie.metadata.imdbRating }}</span>
              <span class="text-theme-textmuted">/ 10</span>
              <span v-if="movie.metadata?.imdbVotes" class="text-sm text-theme-textmuted">
                ({{ formatVotes(movie.metadata.imdbVotes) }})
              </span>
            </div>

            <!-- Action Buttons -->
            <div class="flex flex-wrap gap-3 mb-6">
              <!-- Liked Button -->
              <button class="btn flex items-center gap-2" @click="toggleLiked">
                <div
                  class="i-mdi-heart text-lg"
                  :class="{
                    'text-theme-accent': isLiked,
                  }"
                ></div>
                {{ isLiked ? 'Liked' : 'Like' }}
              </button>

              <!-- Share Button -->
              <button class="btn flex items-center gap-2" @click="shareMovie">
                <div class="i-mdi-share-variant text-lg"></div>
                Share
              </button>
            </div>

            <!-- Genre -->
            <div v-if="movie.metadata?.Genre" class="mb-6">
              <h3 class="movie-label">Genre</h3>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="genre in movie.metadata.Genre.split(', ')"
                  :key="genre"
                  class="px-3 py-1 rounded-full bg-theme-surface border border-theme-border/50 text-sm"
                >
                  {{ genre }}
                </span>
              </div>
            </div>

            <!-- Collections -->
            <div v-if="movieCollections.length > 0" class="mb-6">
              <h3 class="movie-label">Part of Collection</h3>
              <div class="flex flex-wrap gap-2">
                <NuxtLink
                  v-for="collection in movieCollections"
                  :key="collection.id"
                  :to="`/collections/${collection.id}`"
                  class="px-3 py-1 rounded-full bg-theme-primary/10 border border-theme-primary/20 text-theme-primary text-sm hover:bg-theme-primary/20 transition-colors flex items-center gap-1.5"
                >
                  <div class="i-mdi:movie-roll text-base"></div>
                  {{ collection.name }}
                </NuxtLink>
              </div>
            </div>

            <!-- Plot -->
            <div v-if="movie.metadata?.Plot" class="mb-6">
              <h3 class="movie-label">Plot</h3>
              <div class="relative">
                <p
                  class="text-theme-text leading-relaxed transition-all duration-300"
                  :class="{ 'line-clamp-3': !isPlotExpanded }"
                >
                  {{ movie.metadata.Plot }}
                </p>
                <button
                  v-if="movie.metadata.Plot.length > 150"
                  class="mt-1 text-sm font-medium text-theme-primary hover:text-theme-accent transition-colors flex items-center gap-1"
                  @click="isPlotExpanded = !isPlotExpanded"
                >
                  <span>{{ isPlotExpanded ? 'Show less' : 'Show more' }}</span>
                  <div
                    class="transition-transform duration-300"
                    :class="isPlotExpanded ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
                  ></div>
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <div v-if="movie.metadata?.Director">
                <span class="movie-label block !mb-1">Director</span>
                <span class="text-theme-text">{{ movie.metadata.Director }}</span>
              </div>
              <div v-if="movie.metadata?.Writer">
                <span class="movie-label block !mb-1">Writer</span>
                <span class="text-theme-text">{{ movie.metadata.Writer }}</span>
              </div>
              <div v-if="movie.metadata?.Actors">
                <span class="movie-label block !mb-1">Actors</span>
                <span class="text-theme-text">{{ movie.metadata.Actors }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Source Selector with External Links -->
        <div v-if="sortedSources.length > 0" class="mb-4">
          <h3 class="movie-label">Select Source</h3>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="(source, index) in sortedSources"
              :key="source.id"
              class="flex items-center gap-1"
            >
              <div class="flex flex-col gap-1">
                <button
                  class="px-4 py-2 rounded-lg text-sm font-medium transition-colors border relative"
                  :class="{
                    'bg-theme-primary border-theme-primary text-white':
                      selectedSourceIndex === index,
                    'bg-theme-surface border-theme-border/50 text-theme-text hover:bg-theme-selection':
                      selectedSourceIndex !== index,
                  }"
                  @click="selectedSourceIndex = index"
                >
                  <div class="flex items-center gap-2">
                    <div
                      :class="
                        source.type === 'youtube' ? 'i-mdi-youtube text-theme-accent' : 'i-mdi-bank'
                      "
                    ></div>
                    <span>{{
                      source.label ||
                      (source.type === 'youtube' ? source.channelName || 'YouTube' : 'Archive.org')
                    }}</span>
                    <span v-if="source.quality" class="text-xs opacity-75"
                      >({{ source.quality }})</span
                    >
                  </div>
                  <!-- File size indicator bar for Archive.org -->
                  <div
                    v-if="source.type === 'archive.org' && (source.fileSize || source.size)"
                    class="group/size absolute bottom-0 left-0 h-[2px] transition-all duration-500 rounded-b-lg"
                    :class="selectedSourceIndex === index ? 'bg-white/40' : 'bg-theme-primary/40'"
                    :style="{ width: getFileSizeBarWidth(source.fileSize || source.size) }"
                  >
                    <!-- Tooltip -->
                    <div
                      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap opacity-0 group-hover/size:opacity-100 transition-opacity pointer-events-none glass z-10"
                    >
                      {{ formatFileSize(source.fileSize || source.size) }}
                    </div>
                  </div>
                </button>
                <div v-if="source.qualityMarks?.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="mark in source.qualityMarks"
                    :key="mark"
                    class="text-[10px] font-bold text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded border border-yellow-200 dark:border-yellow-800 uppercase tracking-tighter"
                  >
                    {{ mark }}
                  </span>
                </div>
              </div>
              <a
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                :title="
                  source.type === 'youtube'
                    ? `Watch on YouTube${source.channelName ? ' - ' + source.channelName : ''}`
                    : 'Watch on Archive.org'
                "
                class="p-2 rounded-lg transition-colors hover:bg-theme-selection text-theme-primary"
                :class="{ 'text-theme-accent': selectedSourceIndex === index }"
              >
                <div class="i-mdi-open-in-new text-lg"></div>
              </a>
            </div>
          </div>
        </div>

        <!-- Video Player -->
        <div v-if="currentSource" class="bg-black rounded-lg overflow-hidden">
          <!-- YouTube Player -->
          <div v-if="currentSource.type === 'youtube'" class="aspect-video">
            <iframe
              :src="`https://www.youtube.com/embed/${currentSource.id}`"
              class="w-full h-full"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
              title="YouTube video player"
            ></iframe>
          </div>

          <!-- Archive.org Player -->
          <div v-else-if="currentSource.type === 'archive.org'" class="aspect-video">
            <iframe
              :src="`https://archive.org/embed/${currentSource.id}`"
              class="w-full h-full"
              frameborder="0"
              webkitallowfullscreen="true"
              mozallowfullscreen="true"
              allowfullscreen
              title="Archive.org video player"
            ></iframe>
          </div>
        </div>

        <!-- Additional Info -->
        <div
          v-if="movie.metadata"
          class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-theme-border/50"
        >
          <div v-if="movie.metadata.Language">
            <h3 class="movie-label">Language</h3>
            <p class="text-theme-text">
              {{ movie.metadata.Language }}
            </p>
          </div>
          <div v-if="movie.metadata.Country">
            <h3 class="movie-label">Country</h3>
            <p class="text-theme-text">
              {{ movie.metadata.Country }}
            </p>
          </div>
          <div v-if="movie.metadata.Awards">
            <h3 class="movie-label">Awards</h3>
            <p class="text-theme-text">
              {{ movie.metadata.Awards }}
            </p>
          </div>
          <div v-if="movie.imdbId?.startsWith('tt')">
            <h3 class="movie-label">IMDB</h3>
            <a
              :href="`https://www.imdb.com/title/${movie.imdbId}/`"
              target="_blank"
              rel="noopener noreferrer"
              class="text-theme-primary hover:underline"
            >
              View on IMDB
            </a>
          </div>
        </div>

        <!-- Related Movies -->
        <div
          ref="relatedMoviesContainer"
          class="pt-8 border-t border-theme-border/50 min-h-[300px] group/related"
        >
          <div v-if="relatedMovies.length > 0 || isRelatedLoading">
            <h2 class="text-2xl font-bold mb-6">Related Movies</h2>

            <!-- Horizontal scrollable grid -->
            <div class="relative">
              <!-- Left Scroll Button -->
              <button
                v-if="canScrollLeft"
                class="absolute left-2 top-[calc(50%-2rem)] -translate-y-1/2 z-10 p-2 rounded-full bg-theme-surface/60 border border-theme-border/20 text-theme-text/50 shadow-sm hover:bg-theme-accent hover:text-black hover:border-theme-accent transition-all duration-200 hidden md:flex items-center justify-center opacity-0 group-hover/related:opacity-100 group-hover/related:animate-pulse"
                @click="scrollRelated('left')"
              >
                <div class="i-mdi-chevron-left text-2xl"></div>
              </button>

              <!-- Right Scroll Button -->
              <button
                v-if="canScrollRight"
                class="absolute right-2 top-[calc(50%-2rem)] -translate-y-1/2 z-10 p-2 rounded-full bg-theme-surface/60 border border-theme-border/20 text-theme-text/50 shadow-sm hover:bg-theme-accent hover:text-black hover:border-theme-accent transition-all duration-200 hidden md:flex items-center justify-center opacity-0 group-hover/related:opacity-100 group-hover/related:animate-pulse"
                @click="scrollRelated('right')"
              >
                <div class="i-mdi-chevron-right text-2xl"></div>
              </button>

              <div
                ref="relatedScrollContainer"
                class="flex gap-4 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory hide-scrollbar scroll-smooth"
                @scroll="updateRelatedScrollState"
              >
                <template v-if="relatedMovies.length > 0">
                  <div
                    v-for="relatedMovie in relatedMovies"
                    :key="relatedMovie.imdbId"
                    class="flex-shrink-0 w-48 snap-start"
                  >
                    <MovieCard :movie-id="relatedMovie.imdbId" />
                  </div>
                </template>
                <template v-else-if="isRelatedLoading">
                  <div v-for="i in 6" :key="i" class="flex-shrink-0 w-48 snap-start">
                    <MovieCardSkeleton />
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Admin Curation Panel -->
        <AdminCurationPanel v-if="movie" :movie="movie" @updated="handleMovieUpdated" />
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-theme-border/50 mt-12">
      <div class="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-theme-textmuted">
        <p>All movies are legally available from Archive.org and YouTube</p>
        <button class="mt-2 text-xs hover:underline" @click="showKeyboardHelp = true">
          Press ? for keyboard shortcuts
        </button>
      </div>
    </footer>

    <!-- Keyboard Shortcuts Help Modal -->
    <div
      v-if="showKeyboardHelp"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click="showKeyboardHelp = false"
    >
      <div
        class="bg-theme-surface rounded-lg p-6 max-w-md w-full mx-4 border border-theme-border shadow-2xl"
        @click.stop
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-theme-text">Keyboard Shortcuts</h3>
          <button
            class="p-2 hover:bg-theme-selection rounded-full text-theme-text"
            @click="showKeyboardHelp = false"
          >
            <div class="i-mdi-close text-xl"></div>
          </button>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-theme-text">Go back to home</span>
            <kbd
              class="px-3 py-1 bg-theme-selection border border-theme-border/50 rounded text-sm font-mono text-theme-text"
              >ESC</kbd
            >
          </div>

          <div class="flex items-center justify-between">
            <span class="text-theme-text">Toggle liked</span>
            <kbd
              class="px-3 py-1 bg-theme-selection border border-theme-border/50 rounded text-sm font-mono text-theme-text"
              >Space / Enter</kbd
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-theme-text">Previous movie</span>
            <kbd
              class="px-3 py-1 bg-theme-selection border border-theme-border/50 rounded text-sm font-mono text-theme-text"
              >←</kbd
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-theme-text">Next movie</span>
            <kbd
              class="px-3 py-1 bg-theme-selection border border-theme-border/50 rounded text-sm font-mono text-theme-text"
              >→</kbd
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-theme-text">Show this help</span>
            <kbd
              class="px-3 py-1 bg-theme-selection border border-theme-border/50 rounded text-sm font-mono text-theme-text"
              >?</kbd
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry, LightweightMovie } from '~/types'

// Stores - get reactive state and methods once
const movieStore = useMovieStore()
const { likedMovieIds, searchResultMovies } = storeToRefs(movieStore)
const { lightweightMovieCache } = storeToRefs(movieStore)
const { getMovieById, fetchMoviesByIds, loadFromFile, toggleLike } = movieStore
const { showToast } = useUiStore()
const route = useRoute()

// Window scroll control
const { y: scrollY } = useWindowScroll()

// Component state
const movie = ref<MovieEntry | null>(null)
const relatedMovies = ref<LightweightMovie[]>([])
const isLoading = ref(true)
const isRelatedLoading = ref(false)
const error = ref<string | null>(null)
const selectedSourceIndex = ref(0)
const isPlotExpanded = ref(false)

// Related movies lazy loading
const relatedMoviesContainer = ref<HTMLElement | null>(null)
const relatedScrollContainer = ref<HTMLElement | null>(null)
const hasLoadedRelated = ref(false)

const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const updateRelatedScrollState = () => {
  if (!relatedScrollContainer.value) return
  const { scrollLeft, scrollWidth, clientWidth } = relatedScrollContainer.value
  canScrollLeft.value = scrollLeft > 20
  canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 20
}

const scrollRelated = (direction: 'left' | 'right') => {
  if (!relatedScrollContainer.value) return
  const scrollAmount = relatedScrollContainer.value.clientWidth * 0.8
  relatedScrollContainer.value.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth',
  })
}

useIntersectionObserver(relatedMoviesContainer, entries => {
  const entry = entries[0]
  if (entry?.isIntersecting && !hasLoadedRelated.value && movie.value) {
    loadRelatedMovies()
  }
})

// Collections
const movieCollections = computed(() => {
  return movie.value?.collections || []
})

// Sorted sources: YouTube first, then Archive.org by file size
const sortedSources = computed(() => {
  if (!movie.value || !movie.value.sources) return []

  return [...movie.value.sources].sort((a, b) => {
    // 1. YouTube first
    if (a.type === 'youtube' && b.type !== 'youtube') return -1
    if (a.type !== 'youtube' && b.type === 'youtube') return 1

    // 2. If both are Archive.org, sort by file size (descending)
    if (a.type === 'archive.org' && b.type === 'archive.org') {
      const sizeA = a.fileSize || a.size || 0
      const sizeB = b.fileSize || b.size || 0
      return sizeB - sizeA
    }

    return 0
  })
})

// Current selected source
const currentSource = computed(() => {
  if (sortedSources.value.length === 0) return null
  return sortedSources.value[selectedSourceIndex.value] || sortedSources.value[0] || null
})

// Calculate file size bar width (0-4GB range)
const getFileSizeBarWidth = (bytes?: number) => {
  if (!bytes) return '0%'
  const maxBytes = 4 * 1024 * 1024 * 1024 // 4GB
  const percentage = Math.min((bytes / maxBytes) * 100, 100)
  return `${percentage}%`
}

// Liked computed
const isLiked = computed(() => {
  return movie.value ? likedMovieIds.value.includes(movie.value.imdbId) : false
})

// Load related movies
const loadRelatedMovies = async () => {
  if (hasLoadedRelated.value || !movie.value?.relatedMovies?.length) return
  isRelatedLoading.value = true
  try {
    // Fetch movies into cache
    await fetchMoviesByIds(movie.value.relatedMovies)

    // Get movies from cache
    relatedMovies.value = movie.value.relatedMovies
      .map(id => lightweightMovieCache.value.get(id))
      .filter((movie): movie is LightweightMovie => !!movie)

    hasLoadedRelated.value = true
    // Ensure scroll state is updated after loading
    nextTick(() => {
      updateRelatedScrollState()
    })
  } catch {
    // Failed to load related movies, silently continue
    relatedMovies.value = []
  } finally {
    isRelatedLoading.value = false
  }
}

// Load movie data
const loadMovieData = async (movieId: string) => {
  isLoading.value = true
  error.value = null
  selectedSourceIndex.value = 0
  relatedMovies.value = []
  hasLoadedRelated.value = false
  isPlotExpanded.value = false

  try {
    const foundMovie = await getMovieById(movieId)

    if (!foundMovie) {
      error.value = `Movie with ID "${movieId}" not found.`
      isLoading.value = false
      return
    }

    movie.value = foundMovie
    updateMetaTags(foundMovie)

    isLoading.value = false
  } catch (err) {
    console.error('Failed to load movie:', err)
    error.value = `Failed to load movie data. ${err instanceof Error ? err.message : 'Please try again.'}`
    isLoading.value = false
  }
}

// Load movie on mount
onMounted(async () => {
  // Scroll to top when entering movie detail page
  scrollY.value = 0

  // Get movie by ID from route params
  const movieId = route.params.id as string
  await loadMovieData(movieId)
})

// Watch for route changes to reload movie data
watch(
  () => route.params.id,
  async newId => {
    if (newId) {
      // Scroll to top when navigating between movies
      scrollY.value = 0
      await loadMovieData(newId as string)
    }
  }
)

// Keyboard navigation state
const showKeyboardHelp = ref(false)

// Setup keyboard navigation with useMagicKeys
const keys = useMagicKeys()
const { Escape, Space, Enter, ArrowLeft, ArrowRight, Shift_Slash } = keys

// Helper to check if user is typing in an input field
const isTyping = computed(() => {
  const activeElement = document.activeElement
  return activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'
})

// Escape key - go back to home
whenever(
  () => Escape?.value && !isTyping.value,
  () => {
    navigateTo('/')
  }
)

// Space or Enter - toggle liked
whenever(
  () => (Space?.value || Enter?.value) && !isTyping.value,
  () => {
    toggleLiked()
  }
)

// Arrow Left - previous movie
whenever(
  () => ArrowLeft?.value && !isTyping.value,
  () => {
    navigateToAdjacentMovie('prev')
  }
)

// Arrow Right - next movie
whenever(
  () => ArrowRight?.value && !isTyping.value,
  () => {
    navigateToAdjacentMovie('next')
  }
)

// Shift + / (?) - toggle keyboard shortcuts help
whenever(
  () => Shift_Slash?.value && !isTyping.value,
  () => {
    showKeyboardHelp.value = !showKeyboardHelp.value
  }
)

// Navigate to adjacent movie (previous or next)
const navigateToAdjacentMovie = (direction: 'prev' | 'next') => {
  // Use route.params.id directly to avoid stale closures
  const currentId = route.params.id as string
  if (!currentId) return

  const movies = searchResultMovies.value
  const currentIndex = movies.findIndex((id: string) => id === currentId)

  if (currentIndex === -1) return

  const offset = direction === 'prev' ? -1 : 1
  const targetIndex = currentIndex + offset

  // Check bounds
  if (targetIndex < 0 || targetIndex >= movies.length) return

  const targetMovie = movies[targetIndex]
  if (targetMovie) navigateTo(`/movie/${targetMovie}`)
}

// Handle movie updated from curation panel
const handleMovieUpdated = async (newId: string) => {
  // Always reload the database from file first to get the latest changes
  await loadFromFile()

  // If ID changed, update the URL without full navigation if possible
  if (newId !== movie.value?.imdbId) {
    // Use window.history.replaceState to update URL without triggering Nuxt navigation/reload
    // This keeps the current component state but updates the address bar
    const newPath = `/movie/${newId}`
    window.history.replaceState({}, '', newPath)

    // Update the route object manually so other components/composables see the new ID
    route.params.id = newId
  }

  // Refresh current movie data from store
  const foundMovie = await getMovieById(newId)
  if (foundMovie) {
    movie.value = foundMovie
    updateMetaTags(foundMovie)
  }
}

// Update meta tags for SEO and social sharing
const updateMetaTags = (movie: MovieEntry) => {
  const title = movie.title + (movie.year ? ` (${movie.year})` : '')
  const description = movie.metadata?.Plot || `Watch ${movie.title} for free on Movies Deluxe`
  const poster = movie.metadata?.Poster || '/favicon.ico'
  const url = `https://movies-deluxe.app/movie/${movie.imdbId}`

  useHead({
    title,
    meta: [
      // Basic meta tags
      { name: 'description', content: description },

      // Open Graph (Facebook, LinkedIn)
      { property: 'og:type', content: 'video.movie' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: poster },
      { property: 'og:url', content: url },
      { property: 'og:site_name', content: 'Movies Deluxe' },

      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: poster },

      // Additional movie metadata
      ...(movie.metadata?.Director
        ? [{ property: 'video:director', content: movie.metadata.Director }]
        : []),
      ...(movie.metadata?.Actors
        ? [{ property: 'video:actor', content: movie.metadata.Actors }]
        : []),
      ...(movie.year ? [{ property: 'video:release_date', content: movie.year.toString() }] : []),
    ],
    script: [
      // JSON-LD structured data for search engines
      {
        type: 'application/ld+json',
        textContent: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Movie',
          name: movie.title,
          ...(movie.year && { datePublished: movie.year.toString() }),
          ...(movie.metadata?.Plot && { description: movie.metadata.Plot }),
          ...(movie.metadata?.Poster && { image: poster }),
          ...(movie.metadata?.Director && {
            director: { '@type': 'Person', name: movie.metadata.Director },
          }),
          ...(movie.metadata?.Actors && {
            actor: movie.metadata.Actors.split(',').map((name: string) => ({
              '@type': 'Person',
              name: name.trim(),
            })),
          }),
          ...(movie.metadata?.Genre && {
            genre: movie.metadata.Genre.split(',').map((g: string) => g.trim()),
          }),
          ...(movie.metadata?.imdbRating && {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: movie.metadata.imdbRating,
              ...(movie.metadata.imdbVotes && {
                ratingCount: String(movie.metadata.imdbVotes),
              }),
            },
          }),
          ...(movie.imdbId?.startsWith('tt') && {
            sameAs: `https://www.imdb.com/title/${movie.imdbId}/`,
          }),
        }),
      },
    ],
  })
}

// Toggle liked
const toggleLiked = () => {
  if (!movie.value) return
  toggleLike(movie.value.imdbId)
}

// Share movie
const shareMovie = async () => {
  if (!movie.value) return

  const title = movie.value.title + (movie.value.year ? ` (${movie.value.year})` : '')
  const text = movie.value.metadata?.Plot || `Watch ${movie.value.title} for free on Movies Deluxe`
  const url = `${window.location.origin}/movie/${movie.value.imdbId}`

  // Try Web Share API first (mobile and some desktop browsers)
  if (!navigator.share) {
    await copyToClipboard(url)
    return
  }

  try {
    await navigator.share({ title, text, url })
    showToast('Shared successfully!')
  } catch (err) {
    // User cancelled or error occurred
    if ((err as Error).name !== 'AbortError') {
      await copyToClipboard(url)
    }
  }
}

// Copy to clipboard
const copyToClipboard = async (url: string) => {
  try {
    await navigator.clipboard.writeText(url)
    showToast('Link copied to clipboard!')
  } catch {
    showToast('Failed to copy link', 'error')
  }
}

// Handle poster loading errors
const handlePosterError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

// Update scroll state on window resize
if (typeof window !== 'undefined') {
  useEventListener('resize', updateRelatedScrollState)
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
