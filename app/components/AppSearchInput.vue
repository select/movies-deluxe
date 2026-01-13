<template>
  <div class="relative w-full md:w-64 md:flex-shrink-0">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <div v-if="loading" class="i-mdi-loading animate-spin text-lg text-theme-primary"></div>
      <div v-else class="i-mdi-magnify text-lg text-theme-textmuted"></div>
    </div>
    <input
      v-model="model"
      type="text"
      class="block w-full pl-10 pr-10 py-2 bg-theme-surface/50 border border-theme-border/50 focus:border-theme-primary rounded-full text-sm text-theme-text placeholder-theme-textmuted focus:outline-none transition-all focus:bg-theme-surface"
      :placeholder="placeholder"
    />
    <button
      v-if="model"
      class="absolute inset-y-0 right-0 pr-3 flex items-center"
      @click="model = ''"
    >
      <div
        class="i-mdi-close text-base text-theme-textmuted hover:text-theme-text transition-colors"
      ></div>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  placeholder?: string
  loading?: boolean
}>()

const model = defineModel<string>({ default: '' })
</script>
