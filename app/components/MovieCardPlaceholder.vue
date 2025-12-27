<template>
  <div class="block border rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 transition-opacity duration-200">
    <!-- Placeholder for poster (empty) -->
    <div class="aspect-[2/3] bg-gray-200 dark:bg-gray-800" />
    
    <!-- Title only -->
    <div class="p-3">
      <h3 class="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem]">
        {{ title }}
      </h3>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
}

defineProps<Props>()
</script>
