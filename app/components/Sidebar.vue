<template>
  <!-- Desktop: Icon-Only Sidebar (hidden on mobile) -->
  <aside
    class="hidden md:block fixed left-4 top-24 z-40 glass shadow-2xl rounded-full w-12 border-white/30 dark:border-gray-700/50"
  >
    <div class="flex flex-col items-center gap-2 py-2">
      <button
        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        title="Filters"
        @click="openFilters"
      >
        <div class="i-mdi-filter-variant text-xl" />
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  openFilters: []
}>()

const openFilters = () => {
  emit('openFilters')
}
</script>
