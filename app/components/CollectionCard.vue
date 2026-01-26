<template>
  <NuxtLink
    :to="`/collections/${collection.id}`"
    class="group flex flex-col gap-8 p-4 rounded-2xl transition-all duration-500"
  >
    <!-- Stacked Posters -->
    <div class="relative aspect-[4/3] flex items-center justify-center perspective-1000">
      <!-- Bottom Right Poster (Tilted +5deg) -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg overflow-hidden bg-gradient-to-br from-theme-surface to-theme-selection transform rotate-5 translate-x-12 translate-z-0 group-hover:rotate-12 group-hover:translate-x-16 transition-all duration-500 z-10"
      >
        <img
          v-if="posterUrls[2]"
          :src="posterUrls[2]"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="handlePosterError(2)"
        />
      </div>

      <!-- Bottom Left Poster (Tilted -5deg) -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg overflow-hidden bg-gradient-to-br from-theme-surface to-theme-selection transform -rotate-5 -translate-x-12 translate-z-10 group-hover:-rotate-12 group-hover:-translate-x-16 transition-all duration-500 z-20"
      >
        <img
          v-if="posterUrls[1]"
          :src="posterUrls[1]"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="handlePosterError(1)"
        />
      </div>

      <!-- Top Poster (Centered) -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg overflow-hidden bg-gradient-to-br from-theme-surface to-theme-selection transform translate-z-20 group-hover:scale-105 transition-all duration-500 z-30"
      >
        <img
          v-if="posterUrls[0]"
          :src="posterUrls[0]"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="handlePosterError(0)"
        />
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

const selectedMovieIds = ref<(string | null)[]>([null, null, null])
const failedMovieIds = ref<Set<string>>(new Set())

const initializePosters = () => {
  const imdbIds = props.collection.movieIds.filter(id => id.startsWith('tt'))
  const shuffled = shuffleArray(imdbIds)
  selectedMovieIds.value = [shuffled[0] || null, shuffled[1] || null, shuffled[2] || null]
}

// Initialize and watch for collection changes
watch(() => props.collection.id, initializePosters, { immediate: true })

const handlePosterError = (index: number) => {
  const failedId = selectedMovieIds.value[index]
  if (!failedId) return

  failedMovieIds.value.add(failedId)

  const currentSelected = selectedMovieIds.value.filter((id): id is string => id !== null)
  const availableIds = props.collection.movieIds.filter(
    id => id.startsWith('tt') && !currentSelected.includes(id) && !failedMovieIds.value.has(id)
  )

  if (availableIds.length > 0) {
    selectedMovieIds.value[index] =
      availableIds[Math.floor(Math.random() * availableIds.length)] ?? null
  } else {
    selectedMovieIds.value[index] = null
  }
}

// Get poster URLs for selected movies
const posterUrls = computed(() => {
  return selectedMovieIds.value.map(id => (id ? getPosterPath(id) : null))
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
