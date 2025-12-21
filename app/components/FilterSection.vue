<template>
  <div class="mb-6">
    <!-- Filter Title -->
    <div class="flex items-center gap-2 mb-3">
      <div
        v-if="icon"
        :class="['text-lg', icon]"
      />
      <h3 class="font-semibold text-sm">
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
