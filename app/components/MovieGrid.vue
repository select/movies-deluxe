<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
    <MovieCard
      v-for="movie in movies"
      :key="movie.imdbId"
      :movie="movie"
    />
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry } from '~/types'

defineProps<{
  movies: MovieEntry[]
}>()
</script>
