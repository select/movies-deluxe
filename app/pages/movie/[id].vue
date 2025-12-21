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
        <!-- Loading State -->
        <div
          v-if="isLoading"
          class="text-center py-12"
        >
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100" />
          <p class="mt-4 text-gray-600 dark:text-gray-400">
            Loading movie details...
          </p>
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

          <!-- Video Player Placeholder -->
          <div class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center">
            <div class="i-mdi-play-circle text-6xl text-gray-400 dark:text-gray-600 mb-4" />
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              Video player will be implemented in the next task
            </p>
            <a
              v-if="movie.sources[0]"
              :href="movie.sources[0].url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-block px-6 py-3 rounded-full bg-gray-700 dark:bg-yellow-600 text-white hover:bg-gray-600 dark:hover:bg-yellow-500 transition-colors"
            >
              Watch on {{ movie.sources[0].type === 'youtube' ? 'YouTube' : 'Archive.org' }}
            </a>
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
        </div>
      </main>

      <!-- Footer -->
      <footer class="border-t border-gray-200 dark:border-gray-800 mt-12">
        <div class="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>All movies are legally available from Archive.org and YouTube</p>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry } from '~/app/types'

// Nuxt auto-imports
// eslint-disable-next-line no-undef
const route = useRoute()
const movieStore = useMovieStore()

// Dark mode state (sync with localStorage)
const isDark = ref(true)

// Component state
const movie = ref<MovieEntry | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

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
  } else {
    error.value = `Movie with ID "${movieId}" not found.`
  }

  isLoading.value = false
})

// Toggle dark mode
const toggleDarkMode = () => {
  isDark.value = !isDark.value
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }
}

// Handle poster loading errors
const handlePosterError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
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
</style>
