<template>
  <button
    :class="[
      'rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-300',
      compact ? 'p-1.5' : 'p-2'
    ]"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleDarkMode"
  >
    <div
      v-if="isDark"
      class="i-material-symbols-light-wb-sunny text-xl text-yellow-500"
    />
    <div
      v-else
      class="i-material-symbols-light-dark-mode text-xl"
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
