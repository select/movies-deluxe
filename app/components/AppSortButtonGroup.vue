<template>
  <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
    <!-- Relevance (Search Only) -->
    <AppSortButton
      v-if="showRelevance"
      :option="relevanceOption"
      :is-active="isActive(relevanceOption)"
      @select="$emit('select', relevanceOption)"
    />
    
    <!-- Year Toggle Button -->
    <AppSortToggleButton
      label="Year"
      icon="i-mdi-calendar"
      :option-a="yearNewest"
      :option-b="yearOldest"
      :current-sort="currentSort"
      @select="$emit('select', $event)"
    />

    <!-- Rating Toggle Button -->
    <AppSortToggleButton
      label="Rating"
      icon="i-mdi-star"
      :option-a="ratingHigh"
      :option-b="ratingLow"
      :current-sort="currentSort"
      @select="$emit('select', $event)"
    />

    <!-- Title Toggle Button -->
    <AppSortToggleButton
      label="Title"
      icon="i-mdi-sort-alphabetical-ascending"
      :option-a="titleAZ"
      :option-b="titleZA"
      :current-sort="currentSort"
      @select="$emit('select', $event)"
    />

    <!-- Most Popular (Single Button) -->
    <AppSortButton
      :option="mostPopular"
      :is-active="isActive(mostPopular)"
      @select="$emit('select', mostPopular)"
    />
  </div>
</template>

<script setup lang="ts">
import type { SortOption } from '~/types'

interface Props {
  currentSort: SortOption
  showRelevance?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showRelevance: false
})

const _emit = defineEmits<{
  select: [option: SortOption]
}>()

// Define sort options with better labels and icons
const relevanceOption: SortOption = { field: 'relevance', direction: 'desc', label: 'Relevance' }
const yearNewest: SortOption = { field: 'year', direction: 'desc', label: 'Newest' }
const yearOldest: SortOption = { field: 'year', direction: 'asc', label: 'Oldest' }
const ratingHigh: SortOption = { field: 'rating', direction: 'desc', label: 'High' }
const ratingLow: SortOption = { field: 'rating', direction: 'asc', label: 'Low' }
const titleAZ: SortOption = { field: 'title', direction: 'asc', label: 'A-Z' }
const titleZA: SortOption = { field: 'title', direction: 'desc', label: 'Z-A' }
const mostPopular: SortOption = { field: 'votes', direction: 'desc', label: 'Most Popular' }

const isActive = (option: SortOption): boolean => {
  return props.currentSort.field === option.field && props.currentSort.direction === option.direction
}
</script>