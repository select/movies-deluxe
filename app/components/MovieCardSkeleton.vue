<template>
  <div class="block border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-800 animate-pulse">
    <!-- Poster Skeleton -->
    <div class="aspect-[2/3] bg-gray-300 dark:bg-gray-700 relative shimmer" />

    <!-- Movie Info Skeleton -->
    <div class="p-3 space-y-2">
      <!-- Title Skeleton -->
      <div class="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 shimmer" />
      <div class="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 shimmer" />
      
      <!-- Metadata Skeleton -->
      <div class="flex items-center gap-2 pt-1">
        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded w-8 shimmer" />
        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded w-12 shimmer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Shimmer animation for skeleton loaders */
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.2) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite linear;
}

.dark .shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.05) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 1000px 100%;
}
</style>
