<template>
  <div class="relative">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <div class="i-mdi-magnify text-gray-400" />
    </div>
    <input
      :value="localQuery"
      type="text"
      class="block w-full pl-10 pr-3 py-2 border border-theme-border/50 rounded-full leading-5 bg-theme-surface text-theme-text placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary sm:text-sm transition-all"
      :placeholder="placeholder"
      @input="handleInput"
    >
    <button
      v-if="filters.searchQuery"
      class="absolute inset-y-0 right-0 pr-3 flex items-center"
      @click="setSearchQuery('')"
    >
      <div class="i-mdi-close text-theme-textmuted hover:text-theme-text" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { refThrottled } from '@vueuse/core'

const { filters } = storeToRefs(useMovieStore())
const { setSearchQuery, setSort } = useMovieStore()

withDefaults(defineProps<{
  placeholder?: string
}>(), {
  placeholder: 'Search movies, actors, directors...'
})

const localQuery = ref(filters.value.searchQuery)

// Sync local query with store when store changes (e.g. clear button)
watch(() => filters.value.searchQuery, (newQuery) => {
  localQuery.value = newQuery
})

const throttledQuery = refThrottled(localQuery, 500)

watch(throttledQuery, (newQuery) => {
  setSearchQuery(newQuery)

  // If searching, switch to relevance sort if not already
  if (newQuery && filters.value.sort.field !== 'relevance') {
    setSort({ field: 'relevance', direction: 'desc', label: 'Relevance' })
  }
})

const handleInput = (e: Event) => {
  localQuery.value = (e.target as HTMLInputElement).value
}
</script>
