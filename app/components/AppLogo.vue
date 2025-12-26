<template>
  <div>
    <h1
      :class="[
        'font-bold transition-all duration-300',
        compact ? 'text-xl' : 'text-3xl'
      ]"
    >
      Movies Deluxe
    </h1>
    <p
      v-if="!compact"
      class="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-all duration-300"
    >
      Free legal movie streams from Archive.org and YouTube
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()
</script>
