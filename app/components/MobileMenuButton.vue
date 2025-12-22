<template>
  <div>
    <!-- Mobile: Fixed Bottom Button (visible only on mobile) -->
    <button
      class="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gray-700 dark:bg-yellow-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-yellow-500 transition-all flex items-center justify-center"
      :aria-label="isOpen ? 'Close menu' : 'Open menu'"
      @click="toggleMenu"
    >
      <div
        :class="[
          'text-2xl transition-transform duration-300',
          isOpen ? 'i-mdi-close' : 'i-mdi-menu',
        ]"
      />
    </button>

    <!-- Mobile: Overlay (visible only when menu is open) -->
    <div
      v-if="isOpen"
      class="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
      @click="closeMenu"
    />

    <!-- Mobile: Menu Container -->
    <aside
      :class="[
        'md:hidden fixed z-40',
        'top-0 left-0 h-full w-80',
        'transition-all duration-300 ease-in-out',
        'bg-white dark:bg-gray-800',
        'border border-gray-200 dark:border-gray-700',
        'shadow-lg rounded-r-2xl',
        'overflow-hidden',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
    >
      <!-- Header with Close Button -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold">
          Menu
        </h2>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close menu"
          @click="closeMenu"
        >
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <!-- Menu Content -->
      <div
        class="overflow-y-auto scrollbar-thin p-4"
        :style="{ 'max-height': 'calc(100vh - 12rem)' }"
      >
        <!-- Filter Button -->
        <button
          class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
          @click="openFilters"
        >
          <div class="i-mdi-filter-variant text-xl" />
          <span class="text-sm font-medium">Filters</span>
        </button>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
// Mobile menu state (open/closed)
const isOpen = ref(false)

const emit = defineEmits<{
  openFilters: []
}>()

const toggleMenu = () => {
  isOpen.value = !isOpen.value
}

const closeMenu = () => {
  isOpen.value = false
}

const openFilters = () => {
  emit('openFilters')
  // Close mobile menu when opening filters
  closeMenu()
}

// Expose methods for parent components
defineExpose({
  isOpen,
  toggleMenu,
  closeMenu,
})
</script>
