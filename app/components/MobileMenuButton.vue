<template>
  <!-- Mobile: Fixed Bottom Button (visible only on mobile when menu is closed) -->
  <button
    v-if="!isOpen"
    class="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gray-700 dark:bg-yellow-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-yellow-500 transition-all flex items-center justify-center relative"
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

const { activeFiltersCount } = storeToRefs(useMovieStore())
</script>
