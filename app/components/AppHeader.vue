<template>
  <header class="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-800 transition-all duration-300 bg-gradient-to-r from-white/80 via-white/70 to-white/80 dark:from-gray-900/80 dark:via-gray-900/70 dark:to-gray-900/80 backdrop-blur-xl">
    <div
      :class="[
        'max-w-none mx-auto px-4 lg:px-[6%] flex items-center justify-between transition-all duration-300',
        scrollY > 50 ? 'py-3' : 'py-6'
      ]"
    >
      <AppLogo :compact="scrollY > 50" />

      <!-- Desktop Search Bar -->
      <AppSearchBar
        :class="[
          'flex-1 max-w-md mx-8 hidden md:block transition-all duration-300',
          scrollY > 50 ? 'scale-95' : 'scale-100'
        ]"
      />

      <!-- Dark Mode Toggle -->
      <AppDarkModeToggle :compact="scrollY > 50" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  scrollY: number
}>()
</script>
