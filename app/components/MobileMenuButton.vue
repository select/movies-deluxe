<template>
  <!-- Mobile: Fixed Bottom Button (visible only on mobile when menu is closed) -->
  <div
    v-if="!isOpen"
    class="md:hidden fixed bottom-6 right-6 z-50 group"
  >
    <button
      class="w-14 h-14 rounded-full bg-gray-700 dark:bg-yellow-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-yellow-500 transition-all flex items-center justify-center relative"
      aria-label="Open filters"
      @click="emit('openFilters')"
    >
      <div class="i-mdi-filter-variant text-2xl" />
      <span
        v-if="activeFiltersCount > 0"
        class="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full size-5 flex items-center justify-center font-medium"
      >
        {{ activeFiltersCount > 9 ? '9+' : activeFiltersCount }}
      </span>
    </button>
    
    <!-- Clear Filters Button (appears on hover when filters are active) -->
    <button
      v-if="activeFiltersCount > 0"
      class="absolute -top-1 -right-1 size-6 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300 dark:border-gray-600 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 z-10"
      title="Clear all filters"
      @click.stop="clearFilters"
    >
      <div class="i-mdi-close text-sm text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400" />
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  isOpen?: boolean
}

withDefaults(defineProps<Props>(), {
  isOpen: false
})

const emit = defineEmits<{
  openFilters: []
}>()

const movieStore = useMovieStore()
const { activeFiltersCount } = storeToRefs(movieStore)

const clearFilters = () => {
  movieStore.resetFilters()
}
</script>
