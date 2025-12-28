<template>
  <!-- Mobile: Fixed Bottom Button (visible only on mobile when menu is closed) -->
  <button
    v-if="!isOpen"
    class="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gray-700 dark:bg-yellow-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-yellow-500 transition-all flex items-center justify-center"
    aria-label="Open filters"
    @click="emit('openFilters')"
  >
    <div class="i-mdi-filter-variant text-2xl" />
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
</script>
