<template>
  <NuxtLink
    :to="`/movie/${movie.imdbId}`"
    class="block border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
  >
    <!-- Poster -->
    <div class="aspect-[2/3] bg-gray-200 dark:bg-gray-700 relative">
      <!-- Use local poster only for movies with real IMDB IDs -->
      <img
        v-if="movie.imdbId.startsWith('tt')"
        :src="`/posters/${movie.imdbId}.jpg`"
        :alt="movie.title"
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
          class="px-1.5 py-0.5 text-xs rounded-full bg-gray-700 dark:bg-gray-600 text-white"
        >
          Archive.org
        </span>
        <span
          v-else-if="movie.sources[0]?.type === 'youtube'"
          class="px-1.5 py-0.5 text-xs rounded-full bg-red-500 text-white"
        >
          {{ movie.sources[0].channelName || 'YouTube' }}
        </span>
        
        <!-- Language Badge -->
        <span
          v-if="languageCode"
          class="px-1.5 py-0.5 text-xs rounded-full bg-gray-800 dark:bg-gray-700 text-white font-semibold"
        >
          {{ languageCode }}
        </span>
      </div>
    </div>

    <!-- Movie Info -->
    <div class="p-3">
      <h3 class="font-semibold text-sm line-clamp-2 mb-1">
        {{ movie.title }}
      </h3>
      
      <div class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
        <span v-if="movie.year">{{ movie.year }}</span>
        <span v-if="movie.year && movie.metadata?.imdbRating">•</span>
        <span
          v-if="movie.metadata?.imdbRating"
          class="flex items-center gap-1"
        >
          <div class="i-mdi-star text-yellow-500 dark:text-yellow-400" />
          {{ movie.metadata.imdbRating }}
          <span
            v-if="movie.metadata?.imdbVotes"
            class="text-gray-500 dark:text-gray-500"
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
import { getLanguageCode } from '@/utils/formatLanguage'

interface Props {
  movie: MovieEntry
}

const props = defineProps<Props>()

// Computed language code
const languageCode = computed(() => {
  const metadataLang = getLanguageCode(props.movie.metadata?.Language)
  if (metadataLang) return metadataLang
  
  // Fallback to YouTube source language
  if (props.movie.sources[0]?.type === 'youtube') {
    return props.movie.sources[0].language?.toUpperCase() || ''
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
