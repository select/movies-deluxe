<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-8 space-y-2">
      <div class="i-mdi-loading animate-spin text-2xl text-theme-primary"></div>
      <span class="text-xs text-theme-textmuted">Loading genres...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-xs text-red-500 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
      {{ error }}
    </div>

    <!-- Content -->
    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
        <button
          v-for="genre in genres"
          :key="genre.name"
          class="px-3 py-1.5 text-xs rounded-full transition-all inline-flex items-center gap-1.5 border"
          :class="[
            filters.genres.includes(genre.name)
              ? 'bg-theme-primary text-white border-theme-primary shadow-sm'
              : 'bg-theme-selection text-theme-text border-theme-border/50 hover:border-theme-border hover:bg-theme-border/30',
          ]"
          @click="
            filters.genres.includes(genre.name)
              ? (filters.genres = filters.genres.filter(g => g !== genre.name))
              : (filters.genres = [...filters.genres, genre.name])
          "
        >
          <span>{{ genre.name }}</span>
          <span
            class="text-[10px] opacity-70"
            :class="{ 'text-white/80': filters.genres.includes(genre.name) }"
          >
            {{ formatCount(genre.count) }}
          </span>
        </button>
      </div>

      <div
        v-if="filters.genres.length > 0"
        class="flex justify-end pt-2 border-t border-theme-border/30"
      >
        <button class="text-xs text-theme-primary hover:underline font-medium" @click="clearGenres">
          Clear ({{ filters.genres.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GenreOption } from '~/types'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)

const genres = ref<GenreOption[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)

const fetchGenres = async () => {
  isLoading.value = true
  error.value = null
  try {
    const options = await movieStore.getFilterOptions()
    genres.value = options.genres
  } catch (err) {
    error.value = 'Failed to load genres'
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const clearGenres = () => {
  filters.value.genres = []
}

onMounted(() => {
  fetchGenres()
})
</script>
