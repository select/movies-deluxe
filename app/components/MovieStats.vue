<template>
  <div class="mb-8">
    <div class="flex flex-wrap gap-6 text-sm">
      <div>
        <span class="text-gray-500">Total Movies:</span> {{ totalCount }}
      </div>
      <div>
        <span class="text-gray-500">Archive.org:</span> {{ archiveCount }}
      </div>
      <div>
        <span class="text-gray-500">YouTube:</span> {{ youtubeCount }}
      </div>
      <div>
        <span class="text-gray-500">With Metadata:</span> {{ enrichedCount }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  totalCount: number
  archiveCount: number
  youtubeCount: number
  enrichedCount: number
}>()
</script>
