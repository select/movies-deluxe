<template>
  <div class="mb-8">
    <div class="flex flex-wrap gap-6 text-sm">
      <div class="text-theme-text">
        <span class="text-theme-text-muted">Total Movies:</span> {{ totalMovies }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  totalMovies: number
}>()
</script>
