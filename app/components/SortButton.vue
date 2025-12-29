<template>
  <button
    :class="[
      'flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-colors w-full',
      'border border-theme-border/50',
      isActive
        ? 'bg-theme-primary text-white border-theme-primary'
        : 'bg-theme-surface text-theme-text-muted hover:bg-theme-selection hover:border-theme-border'
    ]"
    @click="$emit('select', option)"
  >
    <!-- Icon based on sort field and direction -->
    <div
      :class="[
        'text-sm',
        getSortIcon(),
        isActive ? 'text-white' : 'text-theme-text-muted'
      ]"
    />

    <!-- Label -->
    <span>{{ option.label }}</span>
  </button>
</template>

<script setup lang="ts">
import type { SortOption } from '~/types'

interface Props {
  option: SortOption
  isActive: boolean
}

const props = defineProps<Props>()

defineEmits<{
  select: [option: SortOption]
}>()

const getSortIcon = (): string => {
  const { field, direction } = props.option

  switch (field) {
    case 'relevance':
      return 'i-mdi-target'
    case 'year':
      return direction === 'desc' ? 'i-mdi-calendar-arrow-right' : 'i-mdi-calendar-arrow-left'
    case 'rating':
      return direction === 'desc' ? 'i-mdi-star-arrow-up' : 'i-mdi-star-arrow-down'
    case 'title':
      return direction === 'asc' ? 'i-mdi-sort-alphabetical-ascending' : 'i-mdi-sort-alphabetical-descending'
    case 'votes':
      return 'i-mdi-account-group'
    default:
      return 'i-mdi-sort'
  }
}
</script>
