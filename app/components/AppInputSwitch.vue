<template>
  <label
    class="flex items-center gap-3 cursor-pointer group"
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
  >
    <div class="relative">
      <input
        :checked="checked"
        type="checkbox"
        :disabled="disabled"
        class="sr-only peer"
        @change="handleChange"
      >
      <div
        class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"
      />
    </div>
    <span
      v-if="label"
      class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors"
      :class="{ 'text-gray-500': disabled }"
    >
      {{ label }}
    </span>
    <slot />
  </label>
</template>

<script setup lang="ts">
/* eslint-disable no-undef */
withDefaults(
  defineProps<{
    checked: boolean
    label?: string
    disabled?: boolean
  }>(),
  {
    label: undefined,
    disabled: false,
  }
)

const emit = defineEmits<{
  change: [checked: boolean]
}>()

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('change', target.checked)
}
</script>
