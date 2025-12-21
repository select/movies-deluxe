<template>
  <div>
    <!-- Mobile & Desktop: Fixed Filter Button -->
    <button
      class="fixed top-20 right-6 z-50 px-4 py-2 rounded-full bg-gray-700 dark:bg-yellow-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-yellow-500 transition-all flex items-center gap-2"
      :aria-label="isOpen ? 'Close filters' : 'Open filters'"
      @click="toggleMenu"
    >
      <div
        :class="[
          'text-xl transition-transform duration-300',
          isOpen ? 'i-mdi-close' : 'i-mdi-filter-variant',
        ]"
      />
      <span class="text-sm font-semibold">Filters</span>
    </button>

    <!-- Overlay (visible when menu is open) -->
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
      @click="closeMenu"
    />

    <!-- Filter Menu Panel (slides from top) -->
    <div
      :class="[
        'fixed z-40',
        'transition-all duration-300 ease-in-out',
        'bg-white dark:bg-gray-800',
        'border-b border-gray-200 dark:border-gray-700',
        'shadow-lg',
        'left-0 right-0',
        'overflow-hidden',
        isOpen ? 'top-0' : '-top-full',
      ]"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <div class="i-mdi-filter-variant text-xl" />
          Filters
        </h2>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close filters"
          @click="closeMenu"
        >
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <!-- Filter Content -->
      <div class="overflow-y-auto max-h-[60vh] p-6">
        <div class="max-w-7xl mx-auto">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Source Filter -->
            <FilterSection
              title="Source"
              icon="i-mdi-source-branch"
            >
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">Archive.org</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">YouTube</span>
              </label>
            </FilterSection>

            <!-- Rating Filter -->
            <FilterSection
              title="Rating"
              icon="i-mdi-star"
            >
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">8+ Stars</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">6+ Stars</span>
              </label>
            </FilterSection>

            <!-- Year Filter -->
            <FilterSection
              title="Year"
              icon="i-mdi-calendar"
            >
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">2020s</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">2010s</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  class="rounded"
                >
                <span class="text-sm">2000s</span>
              </label>
            </FilterSection>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Filter menu state (open/closed)
const isOpen = ref(false)

const toggleMenu = () => {
  isOpen.value = !isOpen.value
}

const closeMenu = () => {
  isOpen.value = false
}

// Expose methods for parent components
defineExpose({
  isOpen,
  toggleMenu,
  closeMenu,
})
</script>
