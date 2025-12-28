<template>
  <!-- Compact Toggle Button Group -->
  <div class="flex w-full rounded-full border border-gray-200 dark:border-gray-700 overflow-hidden">
    <button
      :class="[
        'flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors border-r border-gray-200 dark:border-gray-700 flex-1',
        isOptionAActive
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
      ]"
      @click="$emit('select', optionA)"
    >
      <div :class="['text-sm', icon, isOptionAActive ? 'text-white' : 'text-gray-500 dark:text-gray-400']" />
      <span>{{ optionA.label }}</span>
    </button>
    <button
      :class="[
        'flex items-center justify-center px-2 py-1.5 text-xs font-medium transition-colors flex-1',
        isOptionBActive
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
      ]"
      @click="$emit('select', optionB)"
    >
      {{ optionB.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SortOption } from '~/types'

interface Props {
  label: string
  icon: string
  optionA: SortOption
  optionB: SortOption
  currentSort: SortOption
}

const props = defineProps<Props>()

defineEmits<{
  select: [option: SortOption]
}>()

const isOptionAActive = computed(() => {
  return props.currentSort.field === props.optionA.field && props.currentSort.direction === props.optionA.direction
})

const isOptionBActive = computed(() => {
  return props.currentSort.field === props.optionB.field && props.currentSort.direction === props.optionB.direction
})
</script>
