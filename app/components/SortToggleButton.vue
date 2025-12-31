<template>
  <!-- Compact Toggle Button Group -->
  <div class="flex w-full rounded-full border border-theme-border/50 overflow-hidden">
    <button
      class="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors border-r border-theme-border/50 flex-1"
      :class="{
        'bg-theme-primary text-white': isOptionAActive,
        'bg-theme-surface text-theme-textmuted hover:bg-theme-selection': !isOptionAActive
      }"
      @click="$emit('select', optionA)"
    >
      <div
        class="text-sm"
        :class="[icon, isOptionAActive ? 'text-white' : 'text-theme-textmuted']"
      />
      <span>{{ optionA.label }}</span>
    </button>
    <button
      class="flex items-center justify-center px-2 py-1.5 text-xs font-medium transition-colors flex-1"
      :class="{
        'bg-theme-primary text-white': isOptionBActive,
        'bg-theme-surface text-theme-textmuted hover:bg-theme-selection': !isOptionBActive
      }"
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
