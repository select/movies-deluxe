<template>
  <div>
    <!-- Mobile: Fixed Bottom Button (visible only on mobile) -->
    <button
      class="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gray-700 dark:bg-yellow-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-yellow-500 transition-all flex items-center justify-center"
      :aria-label="isMobileOpen ? 'Close sidebar' : 'Open sidebar'"
      @click="toggleMobileSidebar"
    >
      <div
        :class="[
          'text-2xl transition-transform duration-300',
          isMobileOpen ? 'i-mdi-close' : 'i-mdi-menu',
        ]"
      />
    </button>

    <!-- Mobile: Overlay (visible only when mobile sidebar is open) -->
    <div
      v-if="isMobileOpen"
      class="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
      @click="closeMobileSidebar"
    />

    <!-- Sidebar Container -->
    <aside
      :class="[
        'fixed z-40',
        'transition-all duration-300 ease-in-out',
        'bg-white dark:bg-gray-800',
        'border border-gray-200 dark:border-gray-700',
        'shadow-lg',
        'overflow-hidden',
        // Mobile styles (< md breakpoint)
        'top-0 left-0 h-full w-80 rounded-r-2xl',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop styles (>= md breakpoint)
        'md:left-4 md:top-24 md:rounded-full md:translate-x-0 md:w-12',
      ]"
    >
      <!-- Mobile: Header with Close Button -->
      <div class="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold">
          Menu
        </h2>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close sidebar"
          @click="closeMobileSidebar"
        >
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <!-- Mobile: Sidebar Content -->
      <div
        class="md:hidden overflow-y-auto p-4"
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

      <!-- Desktop: Icon-Only Buttons -->
      <div class="hidden md:flex flex-col items-center gap-2 py-2">
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Filters"
          @click="openFilters"
        >
          <div class="i-mdi-filter-variant text-xl" />
        </button>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
// Mobile sidebar state (open/closed)
const isMobileOpen = ref(false)

const emit = defineEmits<{
  openFilters: []
}>()

const toggleMobileSidebar = () => {
  isMobileOpen.value = !isMobileOpen.value
}

const closeMobileSidebar = () => {
  isMobileOpen.value = false
}

const openFilters = () => {
  emit('openFilters')
  // Close mobile sidebar when opening filters
  closeMobileSidebar()
}

// Expose methods for parent components
defineExpose({
  isMobileOpen,
  toggleMobileSidebar,
  closeMobileSidebar,
})
</script>
