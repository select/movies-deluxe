<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between px-4">
      <h2 class="text-xl font-bold text-theme-text flex items-center gap-2">
        <div class="i-mdi-movie-open text-theme-accent" />
        {{ collection.name }}
      </h2>
      <NuxtLink
        :to="`/collections/${collection.id}`"
        class="text-sm text-theme-accent hover:underline flex items-center gap-1 font-medium"
      >
        View all
        <div class="i-mdi-chevron-right" />
      </NuxtLink>
    </div>

    <div
      class="flex overflow-x-auto gap-4 px-4 pb-4 scroll-smooth hide-scrollbar snap-x snap-mandatory"
    >
      <div
        v-for="movie in displayMovies"
        :key="movie.imdbId"
        class="w-[200px] flex-shrink-0 snap-start"
      >
        <MovieCard :movie="movie" />
      </div>

      <div class="w-[200px] flex-shrink-0 snap-start">
        <HomeExploreMoreCard
          :collection-id="collection.id"
          :collection-name="collection.name"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry } from '~/types'

interface CollectionData {
  id: string
  name: string
  movieIds: string[]
}

interface Props {
  collection: CollectionData
}

const props = defineProps<Props>()
const { fetchMoviesByIds } = useMovieStore()

const displayMovies = ref<MovieEntry[]>([])

onMounted(async () => {
  if (props.collection.movieIds.length > 0) {
    // We only show up to 9 movies, then the explore more card
    const movieIds = props.collection.movieIds.slice(0, 9)
    displayMovies.value = await fetchMoviesByIds(movieIds)
  }
})
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
