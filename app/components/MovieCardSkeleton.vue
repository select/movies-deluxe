<template>
  <div class="block overflow-hidden">
    <!-- Poster Skeleton -->
    <div class="aspect-[2/3] skeleton rounded-xl mb-3" />

    <!-- Movie Info Skeleton -->
    <div class="space-y-2">
      <!-- Title Skeleton -->
      <div class="h-5 skeleton rounded-lg w-3/4" />

      <!-- Metadata Skeleton -->
      <div class="flex items-center gap-2 pt-1">
        <div class="h-4 skeleton rounded-full w-12" />
        <div class="h-4 skeleton rounded-full w-16" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// No script needed - using global skeleton styles from UnoCSS
</script>
