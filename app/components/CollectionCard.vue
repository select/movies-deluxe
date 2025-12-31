<template>
  <NuxtLink
    :to="`/collections/${collection.id}`"
    class="group flex flex-col gap-8 p-4 rounded-2xl transition-all duration-500"
  >
    <!-- Stacked Posters -->
    <div class="relative aspect-[4/3] flex items-center justify-center perspective-1000">
      <!-- Bottom Right Poster (Tilted +5deg) -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg overflow-hidden bg-theme-selection transform rotate-5 translate-x-12 translate-z-0 group-hover:rotate-12 group-hover:translate-x-16 transition-all duration-500 z-10"
      >
        <img
          v-if="posters[2]"
          :src="posters[2]"
          class="w-full h-full object-cover"
          loading="lazy"
        >
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-theme-textmuted"
        >
          <div class="i-mdi-movie text-3xl" />
        </div>
      </div>

      <!-- Bottom Left Poster (Tilted -5deg) -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg overflow-hidden bg-theme-selection transform -rotate-5 -translate-x-12 translate-z-10 group-hover:-rotate-12 group-hover:-translate-x-16 transition-all duration-500 z-20"
      >
        <img
          v-if="posters[1]"
          :src="posters[1]"
          class="w-full h-full object-cover"
          loading="lazy"
        >
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-theme-textmuted"
        >
          <div class="i-mdi-movie text-3xl" />
        </div>
      </div>

      <!-- Top Poster (Centered) -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg overflow-hidden bg-theme-selection transform translate-z-20 group-hover:scale-105 transition-all duration-500 z-30"
      >
        <img
          v-if="posters[0]"
          :src="posters[0]"
          class="w-full h-full object-cover"
          loading="lazy"
        >
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-theme-textmuted"
        >
          <div class="i-mdi-movie text-4xl" />
        </div>
      </div>

      <!-- Movie Count Badge -->
      <div class="absolute top-0 right-0 px-2.5 py-1 rounded-full glass text-xs font-bold z-40">
        {{ collection.movieIds.length }} movies
      </div>
    </div>

    <!-- Collection Info -->
    <div class="flex flex-col gap-1">
      <h3 class="text-lg font-bold text-theme-text group-hover:text-theme-accent transition-colors">
        {{ collection.name }}
      </h3>
      <p class="text-sm text-theme-textmuted line-clamp-2 leading-relaxed">
        {{ collection.description }}
      </p>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{
  collection: Collection
}>()

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = shuffled[i]
    shuffled[i] = shuffled[j]!
    shuffled[j] = temp!
  }
  return shuffled
}


// Get posters for preview movies (up to 3, with blanks if fewer)
const posters = computed(() => {
  // Filter for IMDb IDs only (they have posters)
  // Shuffle and take up to 3 (may be less if collection has fewer IMDb movies)
  const previewMovieIds=shuffleArray(props.collection.movieIds.filter(id => id.startsWith('tt'))).slice(0, 3)
  const posterUrls: (string | null)[] = []

  for (let i = 0; i < 3; i++) {
    const movieId = previewMovieIds[i]
    if (movieId) {
      // Construct poster URL directly from IMDb ID
      posterUrls.push(`/posters/${movieId}.jpg`)
    } else {
      posterUrls.push(null)
    }
  }

  return posterUrls
})
</script>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}

.translate-z-0 {
  transform: translateZ(0);
}

.translate-z-10 {
  transform: translateZ(10px);
}

.translate-z-20 {
  transform: translateZ(20px);
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
