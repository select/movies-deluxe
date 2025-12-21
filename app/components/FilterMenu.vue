<template>
  <div>
    <!-- Overlay (visible when menu is open) -->
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
      @click="emit('close')"
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
          @click="emit('close')"
        >
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <!-- Filter Content -->
      <div class="overflow-y-auto max-h-[60vh] p-6">
        <div class="max-w-7xl mx-auto">
          <!-- Sort Controls -->
          <div class="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            <FilterSection
              title="Sort By"
              icon="i-mdi-sort"
            >
              <div class="space-y-2">
                <label
                  v-for="option in sortOptions"
                  :key="`${option.field}-${option.direction}`"
                  class="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    :checked="currentSort.field === option.field && currentSort.direction === option.direction"
                    type="radio"
                    name="sort"
                    :value="option"
                    class="rounded-full"
                    @change="handleSortChange(option)"
                  >
                  <span class="text-sm">{{ option.label }}</span>
                </label>
              </div>
            </FilterSection>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Source Filter -->
            <FilterSection
              title="Source"
              icon="i-mdi-source-branch"
            >
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  :checked="filterStore.filters.sources.includes('archive.org')"
                  type="checkbox"
                  class="rounded"
                  @change="filterStore.toggleSource('archive.org')"
                >
                <span class="text-sm">Archive.org</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  :checked="filterStore.filters.sources.includes('youtube')"
                  type="checkbox"
                  class="rounded"
                  @change="filterStore.toggleSource('youtube')"
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
import { useFilterStore } from '~/app/stores/useFilterStore'
import { SORT_OPTIONS, type SortOption } from '~/utils/movieSort'

interface Props {
  isOpen: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Use filter store
const filterStore = useFilterStore()

// Get sort options from utils
const sortOptions = SORT_OPTIONS

// Safe access to current sort (handles SSR and undefined cases)
const currentSort = computed(() => filterStore.filters.sort || SORT_OPTIONS[0])

// Handle sort change
const handleSortChange = (option: SortOption) => {
  filterStore.setSort(option)
}
</script>
