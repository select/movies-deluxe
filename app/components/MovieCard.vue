<template>
  <MovieCardSkeleton v-if="!movie.title" />
  <NuxtLink
    v-else-if="movie.imdbId"
    ref="cardRef"
    :to="`/movie/${movie.imdbId}`"
    class="flex flex-col border border-theme-border/50 rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-theme-surface text-theme-text"
  >
    <!-- Poster -->
    <div class="aspect-[2/3] bg-theme-selection relative flex-shrink-0 overflow-hidden">
      <!-- Shimmer loading state -->
      <div
        v-if="movie.imdbId?.startsWith('tt')"
        class="absolute inset-0 shimmer z-10 transition-opacity duration-500"
        :class="{ 'opacity-0 pointer-events-none': imageLoaded, 'opacity-100': !imageLoaded }"
      ></div>

      <!-- Use local poster only for movies with real IMDB IDs -->
      <img
        v-if="showFullDetails && movie.imdbId?.startsWith('tt')"
        :src="getPosterPath(movie.imdbId)"
        :alt="movie.title"
        class="w-full h-full object-cover object-center transition-opacity duration-700"
        :class="{ 'opacity-0': !imageLoaded, 'opacity-100': imageLoaded }"
        loading="lazy"
        @load="imageLoaded = true"
        @error="handlePosterError"
      />
      <!-- Icon fallback for movies without local posters -->
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
      >
        <div class="i-mdi-movie text-6xl"></div>
      </div>

      <!-- Badges -->
      <div
        v-if="showFullDetails && movie.sourceType"
        class="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end"
      >
        <!-- Source Badge -->
        <span
          v-if="movie.sourceType === 'archive.org'"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-medium"
        >
          Archive.org
        </span>
        <span
          v-else-if="movie.sourceType === 'youtube'"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-red-600 dark:text-red-400 font-bold"
        >
          {{ movie.channelName || 'YouTube' }}
        </span>

        <!-- Language Badge -->
        <span
          v-if="movie.language"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-bold"
        >
          {{ movie.language.toUpperCase() }}
        </span>
      </div>

      <!-- Like Indicator -->
      <div
        v-if="showFullDetails && movie.imdbId && likedMovieIds.includes(movie.imdbId)"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full glass flex items-center justify-center z-10"
      >
        <div class="i-mdi-heart text-red-500 text-lg"></div>
      </div>

      <!-- Collection Indicator -->
      <div
        v-if="showFullDetails && movieCollections.length > 0"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full glass flex items-center justify-center z-10"
        :class="{ 'ml-8': movie.imdbId && likedMovieIds.includes(movie.imdbId) }"
        :title="movieCollections.map((c: Collection) => c.name).join(', ')"
      >
        <div class="i-mdi:movie-roll text-theme-accent text-lg"></div>
        <span
          v-if="movieCollections.length > 1"
          class="absolute -bottom-1 -right-1 bg-theme-accent text-black text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-theme-surface"
        >
          {{ movieCollections.length }}
        </span>
      </div>

      <!-- Verified Badge -->
      <div
        v-if="showFullDetails && movie.verified"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full flex items-center justify-center z-10"
        :class="{
          'ml-8':
            (movie.imdbId &&
              likedMovieIds.includes(movie.imdbId) &&
              movieCollections.length === 0) ||
            ((!movie.imdbId || !likedMovieIds.includes(movie.imdbId)) &&
              movieCollections.length > 0),
          'ml-16':
            movie.imdbId && likedMovieIds.includes(movie.imdbId) && movieCollections.length > 0,
        }"
        title="Verified Source"
      >
        <div class="i-mdi-check-decagram text-green-600 text-2xl"></div>
      </div>
    </div>

    <!-- Movie Info -->
    <div class="p-3 flex-shrink-0">
      <h3 class="font-bold text-sm line-clamp-2 mb-1.5 leading-snug min-h-[2.5rem]">
        {{ movie.title }}
      </h3>

      <div class="flex items-center gap-1.5 text-[11px] text-theme-textmuted font-medium">
        <span v-if="movie.year">{{ movie.year }}</span>
        <span v-if="showFullDetails && movie.year && movie.imdbRating" class="opacity-50">•</span>
        <span v-if="showFullDetails && movie.imdbRating" class="flex items-center gap-1">
          <div class="i-mdi-star text-theme-accent text-xs"></div>
          <span class="font-bold text-theme-text">{{ movie.imdbRating }}</span>
          <span v-if="movie.imdbVotes" class="text-[10px] opacity-70">
            ({{ formatVotes(movie.imdbVotes) }})
          </span>
        </span>
      </div>
    </div>
  </NuxtLink>

  <!-- Fallback for movies without imdbId -->
  <div
    v-else
    class="flex flex-col border border-red-500/50 rounded-xl overflow-hidden bg-theme-surface text-theme-text opacity-50"
    title="Invalid movie data: missing imdbId"
  >
    <div class="aspect-[2/3] bg-theme-selection relative flex-shrink-0 overflow-hidden">
      <div class="w-full h-full flex items-center justify-center text-red-400">
        <div class="i-mdi-alert-circle text-6xl"></div>
      </div>
    </div>
    <div class="p-3 flex-shrink-0">
      <h3 class="font-bold text-sm line-clamp-2 mb-1.5 leading-snug min-h-[2.5rem] text-red-400">
        {{ movie.title || 'Unknown Movie' }}
      </h3>
      <div class="text-[11px] text-red-400 font-medium">Missing ID</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver, useTimeoutFn } from '@vueuse/core'
import type { LightweightMovieEntry, Collection } from '~/types'

interface Props {
  movie: LightweightMovieEntry
}

const props = defineProps<Props>()

const { likedMovieIds } = storeToRefs(useMovieStore())
const { getCollectionsForMovie } = useCollectionsStore()

const imageLoaded = ref(false)
const movieCollections = ref<Collection[]>([])

// Per-movie debounced rendering state
const showFullDetails = ref(false)
const cardRef = ref<HTMLElement | null>(null)

// Use useTimeoutFn for better control over the timeout
const { start: startDetailsTimer, stop: stopDetailsTimer } = useTimeoutFn(
  async () => {
    showFullDetails.value = true
    // Fetch collections when showing full details
    if (props.movie.imdbId && movieCollections.value.length === 0) {
      movieCollections.value = await getCollectionsForMovie(props.movie.imdbId)
    }
  },
  200,
  { immediate: false }
)

// Use intersection observer to detect when card becomes visible
const { stop } = useIntersectionObserver(
  cardRef,
  (entries) => {
    const entry = entries[0]
    if (!entry) return
    
    if (entry.isIntersecting) {
      // Card is visible, start the timer
      startDetailsTimer()
    } else {
      // Card is not visible, hide details immediately and cancel timer
      showFullDetails.value = false
      stopDetailsTimer()
    }
  },
  {
    threshold: 0.1, // Trigger when 10% of the card is visible
  }
)

// Clean up intersection observer on unmount
onUnmounted(() => {
  stop()
})

// Handle poster loading errors
const handlePosterError = (event: Event) => {
  imageLoaded.value = true // Stop shimmer
  const img = event.target as HTMLImageElement
  // Hide the image and show icon fallback
  img.style.display = 'none'
}
</script>
