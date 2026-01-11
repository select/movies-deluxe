<template>
  <button
    class="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border"
    :class="[
      isActive
        ? 'bg-theme-primary/10 text-theme-primary border-theme-primary/30 shadow-sm'
        : 'bg-transparent text-theme-textmuted border-theme-border/50 hover:bg-theme-surface hover:border-theme-border',
    ]"
    @click="$emit('click', $event)"
  >
    <!-- Icon -->
    <div
      v-if="icon"
      :class="[
        icon,
        'text-sm transition-colors',
        isActive ? 'text-theme-primary' : 'text-theme-textmuted group-hover:text-theme-text',
      ]"
    ></div>

    <!-- Category Label -->
    <span :class="{ 'text-theme-text': !isActive }">{{ category }}</span>

    <!-- Active Value indicator -->
    <template v-if="isActive && activeValue">
      <span class="w-px h-3 bg-theme-primary/30 mx-0.5"></span>
      <span class="text-theme-primary font-bold">{{ activeValue }}</span>
    </template>

    <!-- Clear button (x) -->
    <div
      v-if="isActive"
      class="ml-1 -mr-1 p-0.5 rounded-full hover:bg-theme-primary hover:text-white transition-colors"
      @click.stop="$emit('clear')"
    >
      <div class="i-mdi-close text-[10px]"></div>
    </div>

    <!-- Dropdown indicator (v) -->
    <div
      v-else
      class="i-mdi-chevron-down text-xs opacity-50 group-hover:opacity-100 transition-opacity"
    ></div>
  </button>
</template>

<script setup lang="ts">
interface Props {
  category: string
  icon?: string
  activeValue?: string | number
  isActive?: boolean
}

defineProps<Props>()

defineEmits<{
  click: [event: MouseEvent]
  clear: []
}>()
</script>
