<template>
  <div class="mb-4">
    <!-- Filter Title -->
    <div class="flex items-center gap-2 mb-3 px-2 py-1 rounded-md bg-gradient-to-r from-gray-100 to-transparent dark:from-gray-800 dark:to-transparent">
      <div
        v-if="icon"
        :class="['text-base text-gray-600 dark:text-gray-400', icon]"
      />
      <h3 class="font-bold text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-400">
        {{ title }}
      </h3>
    </div>

    <!-- Filter Content -->
    <div class="space-y-2">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
  icon?: string
}

defineProps<Props>()
</script>
