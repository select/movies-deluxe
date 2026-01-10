<template>
  <NuxtLink
    :to="`/collections/${collectionId}`"
    class="flex flex-col border border-theme-border/50 rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-theme-surface text-theme-text group h-full"
  >
    <!-- Background / Icon -->
    <div
      class="aspect-[2/3] bg-theme-selection relative flex-shrink-0 overflow-hidden flex flex-col items-center justify-center p-6 text-center"
    >
      <div
        class="i-mdi-chevron-right-circle text-6xl text-theme-accent/50 group-hover:text-theme-accent transition-colors duration-300 mb-4"
      />
      <div class="text-lg font-bold leading-tight">
        Explore more
        <div class="text-theme-accent mt-1">
          {{ collectionName }}
        </div>
      </div>

      <!-- Badges area (matching MovieCard) -->
      <div class="absolute top-1.5 right-1.5">
        <span
          class="px-1.5 py-0.5 text-[10px] rounded-full glass text-gray-800 dark:text-white font-medium border border-theme-border/30"
        >
          Collection
        </span>
      </div>
    </div>

    <!-- Info area (matching MovieCard) -->
    <div
      class="p-3 flex-shrink-0 border-t border-theme-border/10 flex-grow flex flex-col justify-between"
    >
      <h3
        class="font-bold text-sm line-clamp-2 mb-1.5 leading-snug min-h-[2.5rem] flex items-center justify-center text-theme-textmuted group-hover:text-theme-text transition-colors text-center"
      >
        See all movies in this collection
      </h3>
      <div
        class="flex items-center justify-center gap-1.5 text-[11px] text-theme-textmuted font-medium"
      >
        <span>Full Collection</span>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
interface Props {
  collectionId: string
  collectionName: string
}

defineProps<Props>()
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.glass {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

:deep(.dark) .glass {
  background: rgba(0, 0, 0, 0.2);
}
</style>
