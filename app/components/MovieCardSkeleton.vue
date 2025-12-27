<template>
  <div class="block skeleton-border border rounded-xl overflow-hidden bg-white dark:bg-gray-900/50">
    <!-- Poster Skeleton -->
    <div class="aspect-[2/3] skeleton relative" />

    <!-- Movie Info Skeleton -->
    <div class="p-3 space-y-2">
      <!-- Title Skeleton -->
      <div class="h-4 skeleton rounded-md w-3/4" />
      <div class="h-4 skeleton rounded-md w-1/2" />
      
      <!-- Metadata Skeleton -->
      <div class="flex items-center gap-2 pt-1">
        <div class="h-3 skeleton rounded-md w-8" />
        <div class="h-3 skeleton rounded-md w-12" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// No script needed - using global skeleton styles from UnoCSS
</script>

