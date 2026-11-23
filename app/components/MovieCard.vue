<template>
  <MovieCardSkeleton v-if="!movie || !movie.title" />
  <NuxtLink
    v-else-if="movie.movieId"
    ref="cardRef"
    :to="`/movie/${movie.movieId}`"
    class="flex flex-col border border-theme-border/50 rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-theme-surface text-theme-text"
  >
    <!-- Poster -->
    <div class="aspect-[2/3] bg-theme-selection relative flex-shrink-0 overflow-hidden">
      <!-- Shimmer loading state -->
      <div
        v-if="movie.movieId?.startsWith('tt') && !posterError"
        class="absolute inset-0 shimmer z-10 transition-opacity duration-500"
        :class="{ 'opacity-0 pointer-events-none': imageLoaded, 'opacity-100': !imageLoaded }"
      ></div>

      <!-- Use local poster only for movies with real IMDB IDs -->
      <img
        v-if="showFullDetails && movie.movieId?.startsWith('tt') && !posterError"
        :src="getPosterPath(movie.movieId)"
        :alt="movie.title"
        class="w-full h-full object-cover object-center transition-opacity duration-700"
        :class="{ 'opacity-0': !imageLoaded, 'opacity-100': imageLoaded }"
        :loading="eager ? 'eager' : 'lazy'"
        @load="imageLoaded = true"
        @error="handlePosterError"
      />
      <!-- Icon fallback for movies without local posters or on error -->
      <div
        v-else
        class="w-full h-full flex items-center justify-center bg-gradient-to-br from-theme-surface to-theme-selection"
      ></div>

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
        v-if="showFullDetails && movie.movieId && likedMovieIds.includes(movie.movieId)"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full glass flex items-center justify-center z-10"
      >
        <div class="i-mdi-heart text-red-500 text-lg"></div>
      </div>

      <!-- Collection Indicator -->
      <div
        v-if="showFullDetails && movieCollections.length > 0"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full glass flex items-center justify-center z-10"
        :class="{ 'ml-8': movie.movieId && likedMovieIds.includes(movie.movieId) }"
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
            (movie.movieId &&
              likedMovieIds.includes(movie.movieId) &&
              movieCollections.length === 0) ||
            ((!movie.movieId || !likedMovieIds.includes(movie.movieId)) &&
              movieCollections.length > 0),
          'ml-16':
            movie.movieId && likedMovieIds.includes(movie.movieId) && movieCollections.length > 0,
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

  <!-- Fallback for movies without movieId -->
  <div
    v-else
    class="flex flex-col border border-red-500/50 rounded-xl overflow-hidden bg-theme-surface text-theme-text opacity-50"
    title="Invalid movie data: missing movieId or movie not loaded"
  >
    <div class="aspect-[2/3] bg-theme-selection relative flex-shrink-0 overflow-hidden">
      <div class="w-full h-full flex items-center justify-center text-red-400">
        <div class="i-mdi-alert-circle text-6xl"></div>
      </div>
    </div>
    <div class="p-3 flex-shrink-0">
      <h3 class="font-bold text-sm line-clamp-2 mb-1.5 leading-snug min-h-[2.5rem] text-red-400">
        {{ movie?.title || props.movieId || 'Unknown Movie' }}
      </h3>
      <div class="text-[11px] text-red-400 font-medium">
        {{ movie ? 'Missing ID' : 'Loading...' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver, useTimeoutFn } from '@vueuse/core'
import type { Collection } from '~/types'
import { storeToRefs } from '#imports'
import { useMovieStore } from '~/stores/useMovieStore'
import { useCollectionsStore } from '~/stores/useCollectionsStore'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { getPosterPath } from '~/utils/posterPath'
import { formatVotes } from '~/utils/formatVotes'
import MovieCardSkeleton from '~/components/MovieCardSkeleton.vue'
import { NuxtLink } from '#components'

interface Props {
  movieId: string | null
  eager?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  eager: false,
})

const { likedMovieIds, lightweightMovieCache } = storeToRefs(useMovieStore())
const { getCollectionsForMovie } = useCollectionsStore()

// Get movie from cache reactively
const movie = computed(() => {
  if (!props.movieId) return null
  return lightweightMovieCache.value.get(props.movieId) || null
})

const imageLoaded = ref(false)
const posterError = ref(false)
const movieCollections = ref<Collection[]>([])

// Per-movie debounced rendering state (skipped when eager)
const showFullDetails = ref(props.eager)
const cardRef = ref<HTMLElement | null>(null)

if (props.eager) {
  let idleHandle: number | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let stopWatch: (() => void) | null = null
  let isUnmounted = false

  const cancelScheduledLookup = () => {
    if (
      idleHandle !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(idleHandle)
      idleHandle = null
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  const scheduleLookup = (movieId: string) => {
    cancelScheduledLookup()
    const run = async () => {
      if (isUnmounted || movieCollections.value.length > 0) return
      const cols = await getCollectionsForMovie(movieId)
      if (!isUnmounted) {
        movieCollections.value = cols
      }
    }

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => {
        idleHandle = null
        void run()
      })
    } else {
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null
        void run()
      }, 150)
    }
  }

  onMounted(() => {
    stopWatch = watch(
      () => movie.value?.movieId,
      movieId => {
        if (movieId && movieCollections.value.length === 0) {
          scheduleLookup(movieId)
        }
      },
      { immediate: true }
    )
  })

  onUnmounted(() => {
    isUnmounted = true
    stopWatch?.()
    cancelScheduledLookup()
  })
} else {
  // Use useTimeoutFn for better control over the timeout
  const { start: startDetailsTimer, stop: stopDetailsTimer } = useTimeoutFn(
    async () => {
      showFullDetails.value = true
      // Fetch collections when showing full details
      if (movie.value?.movieId && movieCollections.value.length === 0) {
        movieCollections.value = await getCollectionsForMovie(movie.value.movieId)
      }
    },
    200,
    { immediate: false }
  )

  // Use intersection observer to detect when card becomes visible
  const { stop } = useIntersectionObserver(
    cardRef,
    entries => {
      const entry = entries[0]
      if (!entry) return

      if (entry.isIntersecting) {
        // Card is visible, start the timer
        startDetailsTimer()
      } else {
        // Card is not visible, just cancel the timer
        // Don't hide details since the component will be unloaded anyway
        stopDetailsTimer()
      }
    },
    {
      rootMargin: '200px', // Start loading 200px before the card enters viewport
    }
  )

  // Clean up intersection observer on unmount
  onUnmounted(() => {
    stop()
  })
}

// Handle poster loading errors
const handlePosterError = () => {
  posterError.value = true
  imageLoaded.value = true // Stop shimmer
}
</script>
