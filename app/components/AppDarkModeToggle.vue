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

// Dark mode state (default to dark)
const isDark = ref(true)

// Initialize dark mode from localStorage
onMounted(() => {
  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('theme')
    isDark.value = savedTheme ? savedTheme === 'dark' : true
  }
})

// Toggle dark mode
const toggleDarkMode = () => {
  isDark.value = !isDark.value
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }
}

// Expose isDark for parent components if needed
defineExpose({
  isDark
})
</script>
