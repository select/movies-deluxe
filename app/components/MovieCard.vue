<template>
  <NuxtLink
    v-if="movieData.imdbId"
    :to="`/movie/${movieData.imdbId}`"
    class="flex flex-col border border-theme-border/50 rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-theme-surface text-theme-text"
  >
    <!-- Poster -->
    <div class="aspect-[2/3] bg-theme-selection relative flex-shrink-0 overflow-hidden">
      <!-- Shimmer loading state -->
      <div
        v-if="hasImdbId"
        class="absolute inset-0 shimmer z-10 transition-opacity duration-500"
        :class="{ 'opacity-0 pointer-events-none': imageLoaded, 'opacity-100': !imageLoaded }"
      ></div>

      <!-- Use local poster only for movies with real IMDB IDs -->
      <img
        v-if="hasImdbId"
        :src="getPosterPath(movieData.imdbId!)"
        :alt="movieData.title"
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
      <div v-if="hasFullData" class="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
        <!-- Source Badge -->
        <span
          v-if="firstSource?.type === 'archive.org'"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-medium"
        >
          Archive.org
        </span>
        <span
          v-else-if="firstSource?.type === 'youtube'"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-red-600 dark:text-red-400 font-bold"
        >
          {{ firstSource.channelName || 'YouTube' }}
        </span>

        <!-- Language Badge -->
        <span
          v-if="languageCode"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-bold"
        >
          {{ languageCode }}
        </span>
      </div>

      <!-- Like Indicator -->
      <div
        v-if="isMovieLiked"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full glass flex items-center justify-center z-10"
      >
        <div class="i-mdi-heart text-red-500 text-lg"></div>
      </div>

      <!-- Collection Indicator -->
      <div
        v-if="movieCollections.length > 0"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full glass flex items-center justify-center z-10"
        :class="{ 'ml-8': isMovieLiked }"
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
        v-if="isVerified"
        class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full flex items-center justify-center z-10"
        :class="{
          'ml-8':
            (isMovieLiked && movieCollections.length === 0) ||
            (!isMovieLiked && movieCollections.length > 0),
          'ml-16': isMovieLiked && movieCollections.length > 0,
        }"
        title="Verified Source"
      >
        <div class="i-mdi-check-decagram text-green-600 text-2xl"></div>
      </div>
    </div>

    <!-- Movie Info -->
    <div class="p-3 flex-shrink-0">
      <h3 class="font-bold text-sm line-clamp-2 mb-1.5 leading-snug min-h-[2.5rem]">
        {{ movieData.title }}
      </h3>

      <div class="flex items-center gap-1.5 text-[11px] text-theme-textmuted font-medium">
        <span v-if="movieData.year">{{ movieData.year }}</span>
        <span v-if="movieData.year && metadata?.imdbRating" class="opacity-50">•</span>
        <span v-if="metadata?.imdbRating" class="flex items-center gap-1">
          <div class="i-mdi-star text-theme-accent text-xs"></div>
          <span class="font-bold text-theme-text">{{ metadata.imdbRating }}</span>
          <span v-if="metadata?.imdbVotes" class="text-[10px] opacity-70">
            ({{ formatVotes(metadata.imdbVotes) }})
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
        {{ movieData.title || 'Unknown Movie' }}
      </h3>
      <div class="text-[11px] text-red-400 font-medium">Missing ID</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry, LightweightMovieEntry, Collection } from '~/types'

interface Props {
  movie: MovieEntry | LightweightMovieEntry
}

const props = defineProps<Props>()

const movieStore = useMovieStore()
const { isLiked: isLikedFn, movieDetailsCache } = movieStore
const { getCollectionsForMovie } = useCollectionsStore()

// Use full movie data from cache if available, otherwise use the provided movie object
const movieData = computed(() => {
  if (props.movie.imdbId && movieDetailsCache.has(props.movie.imdbId)) {
    return movieDetailsCache.get(props.movie.imdbId)!
  }
  return props.movie
})

const imageLoaded = ref(false)
const movieCollections = ref<Collection[]>([])

// Check if movie has a valid IMDB ID (starts with 'tt')
const hasImdbId = computed(() => movieData.value.imdbId?.startsWith('tt') ?? false)

// Check if movie is liked
const isMovieLiked = computed(() =>
  movieData.value.imdbId ? isLikedFn(movieData.value.imdbId) : false
)

// Check if movie is verified
const isVerified = computed(() => {
  if ('verified' in movieData.value) return movieData.value.verified
  return false
})

// Fetch collections for this movie from database
onMounted(async () => {
  if (movieData.value.imdbId) {
    movieCollections.value = await getCollectionsForMovie(movieData.value.imdbId)
  }
})

// Helper to check if we have full movie data
const hasFullData = computed(() => {
  if ('sources' in movieData.value && movieData.value.sources.length > 0) return true
  return 'sourceType' in movieData.value && !!(movieData.value as LightweightMovieEntry).sourceType
})

// Safe access to metadata
const metadata = computed(() => {
  if ('metadata' in movieData.value) return movieData.value.metadata
  const m = movieData.value as LightweightMovieEntry
  return {
    imdbRating: m.imdbRating as string | undefined,
    imdbVotes: m.imdbVotes as string | undefined,
    Language: m.language,
  }
})

// Safe access to sources
const firstSource = computed(() => {
  if ('sources' in movieData.value) return movieData.value.sources[0]
  const m = movieData.value as LightweightMovieEntry
  if (m.sourceType) {
    return {
      type: m.sourceType,
      channelName: m.channelName,
      language: m.language,
    }
  }
  return undefined
})

// Computed language code
const languageCode = computed(() => {
  if (!hasFullData.value) return ''

  // Get language from metadata (already normalized to 2-letter code in database)
  const lang = metadata.value?.Language
  if (lang) {
    // If it's already a 2-letter code, just uppercase it
    if (lang.length === 2) {
      return lang.toUpperCase()
    }
    // Otherwise use getLanguageCode for legacy data
    return getLanguageCode(lang)
  }

  // Fallback to source language (also normalized)
  const sourceLang = firstSource.value?.language
  if (sourceLang) {
    // Handle array of languages - take the first one
    const langStr = Array.isArray(sourceLang) ? sourceLang[0] : sourceLang
    if (langStr && langStr.length === 2) {
      return langStr.toUpperCase()
    }
  }

  return ''
})

// Handle poster loading errors
const handlePosterError = (event: Event) => {
  imageLoaded.value = true // Stop shimmer
  const img = event.target as HTMLImageElement
  // Hide the image and show icon fallback
  img.style.display = 'none'
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
