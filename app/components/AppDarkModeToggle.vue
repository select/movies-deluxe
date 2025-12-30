<template>
  <button
    class="rounded-full bg-theme-surface hover:bg-theme-selection transition-all duration-300 border border-theme-border/50"
    :class="{
      'p-1.5': compact,
      'p-2': !compact
    }"
    aria-label="Open theme selection"
  >
    <div
      v-if="isDark"
      class="i-material-symbols-light-wb-sunny text-xl text-theme-accent"
    />
    <div
      v-else
      class="i-material-symbols-light-dark-mode text-xl text-theme-primary"
    />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()

// Use centralized UI store for dark mode
const uiStore = useUiStore()
const { isDark } = storeToRefs(uiStore)

// Expose isDark for parent components if needed
defineExpose({
  isDark
})
</script>
