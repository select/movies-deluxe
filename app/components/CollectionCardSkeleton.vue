<template>
  <div class="flex flex-col gap-8 p-4 rounded-2xl">
    <!-- Stacked Posters Skeleton -->
    <div class="relative aspect-[4/3] flex items-center justify-center perspective-1000">
      <!-- Bottom Right Poster -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg skeleton transform rotate-5 translate-x-12 z-10"
      ></div>

      <!-- Bottom Left Poster -->
      <div
        class="absolute w-1/2 aspect-[2/3] rounded-lg skeleton transform -rotate-5 -translate-x-12 z-20"
      ></div>

      <!-- Top Poster -->
      <div class="absolute w-1/2 aspect-[2/3] rounded-lg skeleton z-30"></div>

      <!-- Movie Count Badge Skeleton -->
      <div class="absolute top-0 right-0 w-16 h-6 rounded-full skeleton z-40"></div>
    </div>

    <!-- Collection Info Skeleton -->
    <div class="flex flex-col gap-2">
      <!-- Title Skeleton -->
      <div class="h-6 skeleton rounded-lg w-2/3"></div>

      <!-- Description Skeleton -->
      <div class="space-y-2">
        <div class="h-4 skeleton rounded-lg w-full"></div>
        <div class="h-4 skeleton rounded-lg w-4/5"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// No script needed
</script>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}
</style>
