<template>
  <NuxtLink
    :to="`/movie/${imdbId}`"
    class="block border rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
  >
    <!-- Placeholder for poster (empty) -->
    <div class="aspect-[2/3] bg-gray-200 dark:bg-gray-800" />
    
    <!-- Title and year -->
    <div class="p-3">
      <h3 class="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem] mb-1.5">
        {{ title }}
      </h3>
      <div
        v-if="year"
        class="text-[11px] text-gray-500 dark:text-gray-400 font-medium"
      >
        {{ year }}
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
interface Props {
  imdbId: string
  title: string
  year?: number
}

defineProps<Props>()
</script>
