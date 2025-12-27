<template>
  <div class="block border border-gray-100 dark:border-gray-800/50 rounded-xl overflow-hidden bg-white dark:bg-gray-900/50">
    <!-- Poster Skeleton -->
    <div class="aspect-[2/3] bg-gray-100 dark:bg-gray-800/50 relative shimmer" />

    <!-- Movie Info Skeleton -->
    <div class="p-3 space-y-2">
      <!-- Title Skeleton -->
      <div class="h-4 bg-gray-100 dark:bg-gray-800/50 rounded-md w-3/4 shimmer" />
      <div class="h-4 bg-gray-100 dark:bg-gray-800/50 rounded-md w-1/2 shimmer" />
      
      <!-- Metadata Skeleton -->
      <div class="flex items-center gap-2 pt-1">
        <div class="h-3 bg-gray-100 dark:bg-gray-800/50 rounded-md w-8 shimmer" />
        <div class="h-3 bg-gray-100 dark:bg-gray-800/50 rounded-md w-12 shimmer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Modern shimmer animation with smooth easing */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.shimmer {
  background: linear-gradient(
    110deg,
    transparent 0%,
    transparent 40%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2.5s ease-in-out infinite;
}

.dark .shimmer {
  background: linear-gradient(
    110deg,
    transparent 0%,
    transparent 40%,
    rgba(255, 255, 255, 0.03) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 200% 100%;
}
</style>
