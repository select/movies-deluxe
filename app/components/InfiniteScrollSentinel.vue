<template>
  <div class="text-center mt-8 py-4">
    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
    <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
      Loading more movies...
    </p>
  </div>
</template>

<style scoped>
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
