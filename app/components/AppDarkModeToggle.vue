<template>
  <button
    :class="[
      'rounded-full bg-theme-surface hover:bg-theme-selection transition-all duration-300 border border-theme-border/50',
      compact ? 'p-1.5' : 'p-2'
    ]"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleDarkMode"
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

// Toggle dark mode via store
const toggleDarkMode = () => {
  uiStore.toggleDarkMode()
}

// Expose isDark for parent components if needed
defineExpose({
  isDark
})
</script>
