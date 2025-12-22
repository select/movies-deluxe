<template>
  <div
    :class="isDark ? 'dark' : ''"
    class="min-h-screen transition-colors"
  >
    <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <!-- Header -->
      <header class="border-b border-gray-200 dark:border-gray-800">
        <div class="max-w-7xl mx-auto px-4 py-6">
          <div class="flex items-center gap-4">
            <!-- Back Button -->
            <NuxtLink
              to="/"
              class="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Back to movies"
            >
              <div class="i-mdi-arrow-left text-xl" />
            </NuxtLink>

            <div class="flex-1">
              <h1 class="text-2xl font-bold">
                Movies Deluxe
              </h1>
            </div>

            <!-- Dark Mode Toggle -->
            <button
              class="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
              @click="toggleDarkMode"
            >
              <div
                v-if="isDark"
                class="i-mdi-weather-sunny text-xl text-yellow-500"
              />
              <div
                v-else
                class="i-mdi-weather-night text-xl"
              />
            </button>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto px-4 py-8">
        <!-- Loading State - Skeleton -->
        <div
          v-if="isLoading"
          class="space-y-8 animate-pulse"
        >
          <!-- Movie Header Skeleton -->
          <div class="flex flex-col md:flex-row gap-8">
            <!-- Poster Skeleton -->
            <div class="flex-shrink-0">
              <div class="w-full md:w-80 aspect-[2/3] bg-gray-300 dark:bg-gray-700 rounded-lg shimmer" />
            </div>

            <!-- Movie Info Skeleton -->
            <div class="flex-1 space-y-6">
              <!-- Title -->
              <div class="h-10 bg-gray-300 dark:bg-gray-700 rounded-lg w-3/4 shimmer" />

              <!-- Metadata Row -->
              <div class="flex gap-4">
                <div class="h-8 w-20 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
                <div class="h-8 w-16 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
                <div class="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
              </div>

              <!-- Rating -->
              <div class="flex items-center gap-2">
                <div class="h-8 w-8 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
                <div class="h-8 w-16 bg-gray-300 dark:bg-gray-700 rounded shimmer" />
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-3">
                <div class="h-10 w-40 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
                <div class="h-10 w-28 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
              </div>

              <!-- Genre -->
              <div class="space-y-2">
                <div class="h-4 w-16 bg-gray-300 dark:bg-gray-700 rounded shimmer" />
                <div class="flex gap-2">
                  <div class="h-8 w-20 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
                  <div class="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded-full shimmer" />
                </div>
              </div>

              <!-- Plot -->
              <div class="space-y-2">
                <div class="h-4 w-12 bg-gray-300 dark:bg-gray-700 rounded shimmer" />
                <div class="space-y-2">
                  <div class="h-4 bg-gray-300 dark:bg-gray-700 rounded shimmer" />
                  <div class="h-4 bg-gray-300 dark:bg-gray-700 rounded shimmer" />
                  <div class="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 shimmer" />
                </div>
              </div>
            </div>
          </div>

          <!-- Video Player Skeleton -->
          <div class="aspect-video bg-gray-300 dark:bg-gray-700 rounded-lg shimmer" />
        </div>

        <!-- Error State -->
        <div
          v-else-if="error"
          class="text-center py-12"
        >
          <div class="i-mdi-alert-circle text-6xl text-red-500 mb-4" />
          <h2 class="text-2xl font-bold mb-2">
            Movie Not Found
          </h2>
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
        <div
          v-else-if="movie"
          class="space-y-8"
        >
          <!-- Movie Header -->
          <div class="flex flex-col md:flex-row gap-8">
            <!-- Poster -->
            <div class="flex-shrink-0">
              <div class="w-full md:w-80 aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                <img
                  v-if="movie.imdbId.startsWith('tt')"
                  :src="`/posters/${movie.imdbId}.jpg`"
                  :alt="movie.title"
                  class="w-full h-full object-cover"
                  @error="handlePosterError"
                >
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
                >
                  <div class="i-mdi-movie text-8xl" />
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
                  class="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800"
                >
                  {{ movie.year }}
                </span>
                <span
                  v-if="movie.metadata?.Rated"
                  class="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800"
                >
                  {{ movie.metadata.Rated }}
                </span>
                <span
                  v-if="movie.metadata?.Runtime"
                  class="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800"
                >
                  {{ movie.metadata.Runtime }}
                </span>
              </div>

              <!-- Rating -->
              <div
                v-if="movie.metadata?.imdbRating"
                class="flex items-center gap-2 mb-6"
              >
                <div class="i-mdi-star text-yellow-500 dark:text-yellow-400 text-2xl" />
                <span class="text-2xl font-bold">{{ movie.metadata.imdbRating }}</span>
                <span class="text-gray-600 dark:text-gray-400">/ 10</span>
                <span
                  v-if="movie.metadata?.imdbVotes"
                  class="text-sm text-gray-500 dark:text-gray-500"
                >
                  ({{ formatVotes(movie.metadata.imdbVotes) }} votes)
                </span>
              </div>

              <!-- Action Buttons -->
              <div class="flex flex-wrap gap-3 mb-6">
                <!-- Watchlist Button -->
                <button
                  class="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-700 dark:bg-gray-800 text-white hover:bg-gray-600 dark:hover:bg-gray-700 transition-colors"
                  @click="toggleWatchlist"
                >
                  <div
                    :class="[
                      'i-mdi-heart text-lg',
                      isInWatchlist ? 'text-red-500' : ''
                    ]"
                  />
                  {{ isInWatchlist ? 'In Watchlist' : 'Add to Watchlist' }}
                </button>

                <!-- Share Button -->
                <button
                  class="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-700 dark:bg-gray-800 text-white hover:bg-gray-600 dark:hover:bg-gray-700 transition-colors"
                  @click="shareMovie"
                >
                  <div class="i-mdi-share-variant text-lg" />
                  Share
                </button>
              </div>

              <!-- Share Toast -->
              <div
                v-if="showShareToast"
                class="mb-4 p-3 rounded-lg bg-green-600 text-white text-sm flex items-center gap-2"
              >
                <div class="i-mdi-check-circle text-lg" />
                {{ shareToastMessage }}
              </div>

              <!-- Genre -->
              <div
                v-if="movie.metadata?.Genre"
                class="mb-6"
              >
                <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  Genre
                </h3>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="genre in movie.metadata.Genre.split(', ')"
                    :key="genre"
                    class="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm"
                  >
                    {{ genre }}
                  </span>
                </div>
              </div>

              <!-- Plot -->
              <div
                v-if="movie.metadata?.Plot"
                class="mb-6"
              >
                <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  Plot
                </h3>
                <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {{ movie.metadata.Plot }}
                </p>
              </div>

              <!-- Credits -->
              <div class="space-y-3">
                <div v-if="movie.metadata?.Director">
                  <span class="text-sm font-semibold text-gray-600 dark:text-gray-400">Director:</span>
                  <span class="ml-2 text-gray-700 dark:text-gray-300">{{ movie.metadata.Director }}</span>
                </div>
                <div v-if="movie.metadata?.Writer">
                  <span class="text-sm font-semibold text-gray-600 dark:text-gray-400">Writer:</span>
                  <span class="ml-2 text-gray-700 dark:text-gray-300">{{ movie.metadata.Writer }}</span>
                </div>
                <div v-if="movie.metadata?.Actors">
                  <span class="text-sm font-semibold text-gray-600 dark:text-gray-400">Actors:</span>
                  <span class="ml-2 text-gray-700 dark:text-gray-300">{{ movie.metadata.Actors }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Video Player -->
          <div
            v-if="movie.sources[0]"
            class="bg-black rounded-lg overflow-hidden"
          >
            <!-- YouTube Player -->
            <div
              v-if="movie.sources[0].type === 'youtube'"
              class="aspect-video"
            >
              <iframe
                :src="getYouTubeEmbedUrl(movie.sources[0].url)"
                class="w-full h-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                title="YouTube video player"
              />
            </div>

            <!-- Archive.org Player -->
            <div
              v-else-if="movie.sources[0].type === 'archive.org'"
              class="aspect-video"
            >
              <iframe
                :src="getArchiveEmbedUrl(movie.sources[0])"
                class="w-full h-full"
                frameborder="0"
                webkitallowfullscreen="true"
                mozallowfullscreen="true"
                allowfullscreen
                title="Archive.org video player"
              />
            </div>

            <!-- Fallback: External Link -->
            <div
              v-else
              class="aspect-video flex items-center justify-center bg-gray-800"
            >
              <div class="text-center p-8">
                <div class="i-mdi-open-in-new text-6xl text-gray-400 mb-4" />
                <p class="text-gray-300 mb-4">
                  Video player not available for this source
                </p>
                <a
                  :href="movie.sources[0].url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-block px-6 py-3 rounded-full bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                >
                  Watch Externally
                </a>
              </div>
            </div>
          </div>

          <!-- Additional Info -->
          <div
            v-if="movie.metadata"
            class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-gray-200 dark:border-gray-800"
          >
            <div v-if="movie.metadata.Language">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                Language
              </h3>
              <p class="text-gray-700 dark:text-gray-300">
                {{ movie.metadata.Language }}
              </p>
            </div>
            <div v-if="movie.metadata.Country">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                Country
              </h3>
              <p class="text-gray-700 dark:text-gray-300">
                {{ movie.metadata.Country }}
              </p>
            </div>
            <div v-if="movie.metadata.Awards">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                Awards
              </h3>
              <p class="text-gray-700 dark:text-gray-300">
                {{ movie.metadata.Awards }}
              </p>
            </div>
            <div v-if="movie.imdbId.startsWith('tt')">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                IMDB
              </h3>
              <a
                :href="`https://www.imdb.com/title/${movie.imdbId}/`"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 dark:text-blue-400 hover:underline"
              >
                View on IMDB
              </a>
            </div>
          </div>

          <!-- Related Movies -->
          <div
            v-if="relatedMovies.length > 0"
            class="pt-8 border-t border-gray-200 dark:border-gray-800"
          >
            <h2 class="text-2xl font-bold mb-6">
              Related Movies
            </h2>

            <!-- Horizontal scrollable grid -->
            <div class="relative">
              <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin">
                <div
                  v-for="relatedMovie in relatedMovies"
                  :key="relatedMovie.imdbId"
                  class="flex-shrink-0 w-48 snap-start"
                >
                  <MovieCard :movie="relatedMovie" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Footer -->
      <footer class="border-t border-gray-200 dark:border-gray-800 mt-12">
        <div class="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>All movies are legally available from Archive.org and YouTube</p>
          <button
            class="mt-2 text-xs hover:underline"
            @click="showKeyboardHelp = true"
          >
            Press ? for keyboard shortcuts
          </button>
        </div>
      </footer>

      <!-- Keyboard Shortcuts Help Modal -->
      <div
        v-if="showKeyboardHelp"
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        @click="showKeyboardHelp = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
          @click.stop
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold">
              Keyboard Shortcuts
            </h3>
            <button
              class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              @click="showKeyboardHelp = false"
            >
              <div class="i-mdi-close text-xl" />
            </button>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">Go back to home</span>
              <kbd class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">ESC</kbd>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">Toggle watchlist</span>
              <kbd class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">Space / Enter</kbd>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">Previous movie</span>
              <kbd class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">←</kbd>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">Next movie</span>
              <kbd class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">→</kbd>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">Show this help</span>
              <kbd class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">?</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry, ArchiveOrgSource } from '~/app/types'

// Nuxt auto-imports
// eslint-disable-next-line no-undef
const route = useRoute()
const movieStore = useMovieStore()
// eslint-disable-next-line no-undef
const watchlistStore = useWatchlistStore()

// Dark mode state (sync with localStorage)
const isDark = ref(true)

// Component state
const movie = ref<MovieEntry | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

// Share functionality state
const showShareToast = ref(false)
const shareToastMessage = ref('')

// Watchlist computed
const isInWatchlist = computed(() => {
  return movie.value ? watchlistStore.isInWatchlist(movie.value.imdbId) : false
})

// Related movies computed
const relatedMovies = computed(() => {
  if (!movie.value) return []

  const currentMovie = movie.value
  const allMovies = movieStore.movies

  /**
   * Score each movie based on similarity to current movie.
   * 
   * Scoring criteria (in order of weight):
   * - Genre match: 10 points per shared genre (can stack, e.g., 30 for 3 shared genres)
   * - Director match: 15 points (binary - same director or not)
   * - Actor match: 5 points per shared actor (balanced to prevent dominance)
   * - Year proximity: 2-10 points (closer years = higher score, ±5 years max)
   * - Metadata presence: 1 point (prefer enriched movies)
   * 
   * Actor scoring rationale:
   * - 5 points per actor balances well with other criteria
   * - 2 shared actors (10 pts) ≈ 1 genre match (10 pts)
   * - Prevents actor-heavy movies from dominating recommendations
   * - Still meaningful enough to surface cast-based similarities
   */
  const scored = allMovies
    .filter(m => m.imdbId !== currentMovie.imdbId) // Exclude current movie
    .map(m => {
      let score = 0

      // Genre match (highest priority)
      if (currentMovie.metadata?.Genre && m.metadata?.Genre) {
        const currentGenres = currentMovie.metadata.Genre.split(',').map(g => g.trim().toLowerCase())
        const movieGenres = m.metadata.Genre.split(',').map(g => g.trim().toLowerCase())
        const commonGenres = currentGenres.filter(g => movieGenres.includes(g))
        score += commonGenres.length * 10 // 10 points per matching genre
      }

      // Year similarity (±5 years)
      if (currentMovie.year && m.year) {
        const yearDiff = Math.abs(parseInt(currentMovie.year) - parseInt(m.year))
        if (yearDiff <= 5) {
          score += (5 - yearDiff) * 2 // 2-10 points based on proximity
        }
      }

      // Director match
      if (currentMovie.metadata?.Director && m.metadata?.Director) {
        if (currentMovie.metadata.Director === m.metadata.Director) {
          score += 15 // 15 points for same director
        }
      }

      // Actor matches
      if (currentMovie.metadata?.Actors && m.metadata?.Actors) {
        const currentActors = currentMovie.metadata.Actors.split(',').map(a => a.trim().toLowerCase())
        const movieActors = m.metadata.Actors.split(',').map(a => a.trim().toLowerCase())
        const commonActors = currentActors.filter(a => movieActors.includes(a))
        score += commonActors.length * 5 // 5 points per shared actor
      }

      // Prefer movies with metadata
      if (m.metadata) {
        score += 1
      }

      return { movie: m, score }
    })
    .filter(item => item.score > 0) // Only include movies with some similarity
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .slice(0, 8) // Limit to 8 movies
    .map(item => item.movie)

  return scored
})

// Load movie on mount
onMounted(async () => {
  // Load dark mode preference
  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('theme')
    isDark.value = savedTheme ? savedTheme === 'dark' : true
  }

  // Load movies if not already loaded
  if (movieStore.movies.length === 0) {
    await movieStore.loadFromFile()
  }

  // Get movie by ID from route params
  const movieId = route.params.id as string
  const foundMovie = movieStore.getMovieById(movieId)

  if (foundMovie) {
    movie.value = foundMovie
    updateMetaTags(foundMovie)
  } else {
    error.value = `Movie with ID "${movieId}" not found.`
  }

  isLoading.value = false

  // Setup keyboard navigation
  setupKeyboardNavigation()
})

// Keyboard navigation state
const showKeyboardHelp = ref(false)

// Setup keyboard navigation
const setupKeyboardNavigation = () => {
   
  const handleKeyPress = (event: KeyboardEvent) => {
    // Ignore if user is typing in an input field
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    switch (event.key) {
      case 'Escape':
        // Go back to home
        // eslint-disable-next-line no-undef
        navigateTo('/')
        break

      case ' ':
      case 'Enter':
        // Toggle watchlist (only if Space or Enter)
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault() // Prevent page scroll on Space
          toggleWatchlist()
        }
        break

      case 'ArrowLeft':
        // Navigate to previous movie
        navigateToPrevMovie()
        break

      case 'ArrowRight':
        // Navigate to next movie
        navigateToNextMovie()
        break

      case '?':
        // Toggle keyboard shortcuts help
        showKeyboardHelp.value = !showKeyboardHelp.value
        break
    }
  }

   
  window.addEventListener('keydown', handleKeyPress)

  // Cleanup on unmount
  onUnmounted(() => {
     
    window.removeEventListener('keydown', handleKeyPress)
  })
}

// Navigate to previous movie
const navigateToPrevMovie = () => {
  if (!movie.value) return

  const currentIndex = movieStore.movies.findIndex(m => m.imdbId === movie.value!.imdbId)
  if (currentIndex > 0) {
    const prevMovie = movieStore.movies[currentIndex - 1]
    // eslint-disable-next-line no-undef
    navigateTo(`/movie/${prevMovie.imdbId}`)
  }
}

// Navigate to next movie
const navigateToNextMovie = () => {
  if (!movie.value) return

  const currentIndex = movieStore.movies.findIndex(m => m.imdbId === movie.value!.imdbId)
  if (currentIndex < movieStore.movies.length - 1) {
    const nextMovie = movieStore.movies[currentIndex + 1]
    // eslint-disable-next-line no-undef
    navigateTo(`/movie/${nextMovie.imdbId}`)
  }
}

// Update meta tags for SEO and social sharing
const updateMetaTags = (movie: MovieEntry) => {
  const title = movie.title + (movie.year ? ` (${movie.year})` : '')
  const description = movie.metadata?.Plot || `Watch ${movie.title} for free on Movies Deluxe`
  const poster = movie.poster || '/favicon.ico'
  const url = `https://movies-deluxe.app/movie/${movie.imdbId}`

  // eslint-disable-next-line no-undef
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
      ...(movie.metadata?.Director ? [{ property: 'video:director', content: movie.metadata.Director }] : []),
      ...(movie.metadata?.Actors ? [{ property: 'video:actor', content: movie.metadata.Actors }] : []),
      ...(movie.year ? [{ property: 'video:release_date', content: movie.year.toString() }] : []),
    ],
    script: [
      // JSON-LD structured data for search engines
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Movie',
          name: movie.title,
          ...(movie.year && { datePublished: movie.year.toString() }),
          ...(movie.metadata?.Plot && { description: movie.metadata.Plot }),
          ...(movie.poster && { image: poster }),
          ...(movie.metadata?.Director && { director: { '@type': 'Person', name: movie.metadata.Director } }),
          ...(movie.metadata?.Actors && {
            actor: movie.metadata.Actors.split(',').map((name: string) => ({
              '@type': 'Person',
              name: name.trim()
            }))
          }),
          ...(movie.metadata?.Genre && { genre: movie.metadata.Genre.split(',').map((g: string) => g.trim()) }),
          ...(movie.metadata?.imdbRating && {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: movie.metadata.imdbRating,
              ...(movie.metadata.imdbVotes && { ratingCount: movie.metadata.imdbVotes.replace(/,/g, '') })
            }
          }),
          ...(movie.imdbId.startsWith('tt') && { sameAs: `https://www.imdb.com/title/${movie.imdbId}/` })
        })
      }
    ]
  })
}

// Toggle dark mode
const toggleDarkMode = () => {
  isDark.value = !isDark.value
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }
}

// Toggle watchlist
const toggleWatchlist = () => {
  if (!movie.value) return
  watchlistStore.toggle(movie.value.imdbId)
}

// Share movie
const shareMovie = async () => {
  if (!movie.value) return

  const title = movie.value.title + (movie.value.year ? ` (${movie.value.year})` : '')
  const text = movie.value.metadata?.Plot || `Watch ${movie.value.title} for free on Movies Deluxe`
   
  const url = `${window.location.origin}/movie/${movie.value.imdbId}`

  // Try Web Share API first (mobile and some desktop browsers)
  // eslint-disable-next-line no-undef
  if (navigator.share) {
    try {
      // eslint-disable-next-line no-undef
      await navigator.share({
        title,
        text,
        url
      })
      showToast('Shared successfully!')
    } catch (err) {
      // User cancelled or error occurred
      if ((err as Error).name !== 'AbortError') {
        // eslint-disable-next-line no-undef, no-console
        console.error('Share failed:', err)
        fallbackCopyToClipboard(url)
      }
    }
  } else {
    // Fallback to clipboard
    fallbackCopyToClipboard(url)
  }
}

// Fallback: Copy to clipboard
const fallbackCopyToClipboard = async (url: string) => {
  try {
    // eslint-disable-next-line no-undef
    await navigator.clipboard.writeText(url)
    showToast('Link copied to clipboard!')
  } catch (err) {
    // eslint-disable-next-line no-undef, no-console
    console.error('Copy failed:', err)
    showToast('Failed to copy link')
  }
}

// Show toast notification
const showToast = (message: string) => {
  shareToastMessage.value = message
  showShareToast.value = true

   
  setTimeout(() => {
    showShareToast.value = false
  }, 3000)
}

// Handle poster loading errors
const handlePosterError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

/**
 * Extract YouTube video ID from URL and create embed URL
 * Supports formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
const getYouTubeEmbedUrl = (url: string): string => {
  try {
    // eslint-disable-next-line no-undef
    const urlObj = new URL(url)

    // Handle youtu.be short links
    if (urlObj.hostname === 'youtu.be') {
      const videoId = urlObj.pathname.slice(1) // Remove leading slash
      return `https://www.youtube.com/embed/${videoId}`
    }

    // Handle youtube.com links
    if (urlObj.hostname.includes('youtube.com')) {
      // Already an embed URL
      if (urlObj.pathname.includes('/embed/')) {
        return url
      }

      // Extract from watch?v= parameter
      const videoId = urlObj.searchParams.get('v')
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`
      }
    }

    // Fallback: return original URL
    return url
  } catch {
    // Invalid URL, return as-is
    return url
  }
}

/**
 * Create Archive.org embed URL from source
 * Uses the identifier from the source or extracts from URL
 */
const getArchiveEmbedUrl = (source: ArchiveOrgSource): string => {
  // If source has identifier field, use it directly
  if (source.identifier) {
    return `https://archive.org/embed/${source.identifier}`
  }

  // Try to extract identifier from URL
  try {
    // eslint-disable-next-line no-undef
    const url = new URL(source.url)
    const pathParts = url.pathname.split('/').filter(Boolean)

    // URL format: https://archive.org/details/IDENTIFIER
    if (pathParts[0] === 'details' && pathParts[1]) {
      return `https://archive.org/embed/${pathParts[1]}`
    }

    // Fallback: return original URL
    return source.url
  } catch {
    return source.url
  }
}
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

/* Shimmer animation for skeleton loaders */
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.shimmer {
  background: linear-gradient(
    90deg,
    currentColor 0%,
    rgba(255, 255, 255, 0.3) 50%,
    currentColor 100%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite linear;
}
</style>
