<template>

  <div
    :class="isDark ? 'dark' : ''"
    class="min-h-screen transition-colors"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'

const uiStore = useUiStore()
const { isDark } = storeToRefs(uiStore)
</script>
