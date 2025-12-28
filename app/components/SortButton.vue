<template>
  <button
    :class="[
      'flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-colors w-full',
      'border border-gray-200 dark:border-gray-700',
      isActive
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
    ]"
    @click="$emit('select', option)"
  >
    <!-- Icon based on sort field and direction -->
    <div
      :class="[
        'text-sm',
        getSortIcon(),
        isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'
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
