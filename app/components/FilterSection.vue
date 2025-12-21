<template>
  <div class="mb-4">
    <!-- Filter Title -->
    <div class="flex items-center gap-2 mb-2">
      <div
        v-if="icon"
        :class="['text-base', icon]"
      />
      <h3 class="font-semibold text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
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
