<template>
  <div class="relative">
    <!-- Sidebar Container - Elongated Vertical Pill -->
    <aside
      :class="[
        'fixed left-4 top-24 z-40',
        'transition-all duration-300 ease-in-out',
        'bg-white dark:bg-gray-800',
        'border border-gray-200 dark:border-gray-700',
        'shadow-lg',
        isExpanded ? 'w-64' : 'w-16',
        'rounded-full',
        'overflow-hidden',
      ]"
      style="max-height: calc(100vh - 8rem)"
    >
      <!-- Toggle Button -->
      <button
        class="w-full p-4 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        :aria-label="isExpanded ? 'Collapse sidebar' : 'Expand sidebar'"
        @click="toggleSidebar"
      >
        <div
          :class="[
            'text-xl transition-transform duration-300',
            isExpanded ? 'i-mdi-chevron-left' : 'i-mdi-chevron-right',
          ]"
        />
        <span
          v-if="isExpanded"
          class="ml-2 font-semibold text-sm"
        >
          Filters
        </span>
      </button>

      <!-- Divider -->
      <div
        v-if="isExpanded"
        class="border-t border-gray-200 dark:border-gray-700"
      />

      <!-- Filter Content -->
      <div
        v-if="isExpanded"
        class="p-4 overflow-y-auto"
        style="max-height: calc(100vh - 12rem)"
      >
        <slot />
      </div>

      <!-- Collapsed State Icons -->
      <div
        v-else
        class="flex flex-col items-center gap-4 py-4"
      >
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Source Filter"
        >
          <div class="i-mdi-filter text-xl" />
        </button>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Rating Filter"
        >
          <div class="i-mdi-star text-xl" />
        </button>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Year Filter"
        >
          <div class="i-mdi-calendar text-xl" />
        </button>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
const isExpanded = ref(false)

const toggleSidebar = () => {
  isExpanded.value = !isExpanded.value
}

// Expose methods for parent components
defineExpose({
  isExpanded,
  toggleSidebar,
})
</script>
