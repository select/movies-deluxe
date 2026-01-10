<template>
  <button
    class="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-colors w-full border border-theme-border/50"
    :class="{
      'bg-theme-primary text-white border-theme-primary': isActive,
      'bg-theme-surface text-theme-textmuted hover:bg-theme-selection hover:border-theme-border':
        !isActive,
    }"
    @click="$emit('select', option)"
  >
    <!-- Icon based on sort field and direction -->
    <div
      class="text-sm"
      :class="{
        [getSortIcon()]: true,
        'text-white': isActive,
        'text-theme-textmuted': !isActive,
      }"
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
  const { field } = props.option

  switch (field) {
    case 'relevance':
      return 'i-mdi-target'
    case 'votes':
      return 'i-mdi-account-group'
    default:
      return 'i-mdi-sort'
  }
}
</script>
