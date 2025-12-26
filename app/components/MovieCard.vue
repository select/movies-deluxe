<template>
  <NuxtLink
    :to="`/movie/${movie.imdbId}`"
    class="flex flex-col border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900"
  >
    <!-- Poster -->
    <div class="aspect-[2/3] bg-gray-200 dark:bg-gray-700 relative flex-shrink-0">
      <!-- Use local poster only for movies with real IMDB IDs -->
      <img
        v-if="movie.imdbId.startsWith('tt')"
        :src="`/posters/${movie.imdbId}.jpg`"
        :alt="getPrimaryTitle(movie)"
        class="w-full h-full object-cover"
        loading="lazy"
        @error="handlePosterError"
      >
      <!-- Icon fallback for movies without local posters -->
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
      >
        <div class="i-mdi-movie text-6xl" />
      </div>
      
      <!-- Badges -->
      <div class="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
        <!-- Source Badge -->
        <span
          v-if="movie.sources[0]?.type === 'archive.org'"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-medium"
        >
          Archive.org
        </span>
        <span
          v-else-if="movie.sources[0]?.type === 'youtube'"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-red-600 dark:text-red-400 font-bold"
        >
          {{ movie.sources[0].channelName || 'YouTube' }}
        </span>
        
        <!-- Language Badge -->
        <span
          v-if="languageCode"
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-bold"
        >
          {{ languageCode }}
        </span>
      </div>
    </div>

    <!-- Movie Info -->
    <div class="p-3 flex-shrink-0">
      <h3 class="font-bold text-sm line-clamp-2 mb-1.5 leading-snug min-h-[2.5rem]">
        {{ getPrimaryTitle(movie) }}
      </h3>
      
      <div class="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
        <span v-if="movie.year">{{ movie.year }}</span>
        <span
          v-if="movie.year && movie.metadata?.imdbRating"
          class="opacity-50"
        >•</span>
        <span
          v-if="movie.metadata?.imdbRating"
          class="flex items-center gap-1"
        >
          <div class="i-mdi-star text-yellow-500 dark:text-yellow-400 text-xs" />
          <span class="font-bold text-gray-700 dark:text-gray-200">{{ movie.metadata.imdbRating }}</span>
          <span
            v-if="movie.metadata?.imdbVotes"
            class="text-[10px] opacity-70"
          >
            ({{ formatVotes(movie.metadata.imdbVotes) }})
          </span>
        </span>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { MovieEntry } from '~/types'

interface Props {
  movie: MovieEntry
}

const props = defineProps<Props>()

// Computed language code
const languageCode = computed(() => {
  // Get language from metadata (already normalized to 2-letter code in database)
  const lang = props.movie.metadata?.Language
  if (lang) {
    // If it's already a 2-letter code, just uppercase it
    if (lang.length === 2) {
      return lang.toUpperCase()
    }
    // Otherwise use getLanguageCode for legacy data
    return getLanguageCode(lang)
  }
  
  // Fallback to source language (also normalized)
  const sourceLang = props.movie.sources[0]?.language
  if (sourceLang && sourceLang.length === 2) {
    return sourceLang.toUpperCase()
  }
  
  return ''
})

// Handle poster loading errors
const handlePosterError = (event: Event) => {
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
