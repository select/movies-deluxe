<template>
  <label
    class="flex items-center gap-2 cursor-pointer group"
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
  >
    <div
      class="flex items-center justify-center w-5 h-5 transition-colors"
      :class="{
        'text-theme-primary': modelValue,
        'text-theme-textmuted group-hover:text-theme-text': !modelValue,
      }"
      role="checkbox"
      :aria-checked="modelValue"
      :aria-disabled="disabled"
    >
      <div v-if="modelValue" class="i-mdi-checkbox-marked text-xl"></div>
      <div v-else class="i-mdi-checkbox-blank-outline text-xl"></div>
    </div>
    <input
      :checked="modelValue"
      type="checkbox"
      :value="value"
      :disabled="disabled"
      class="sr-only"
      @change="handleChange"
    />
    <span v-if="label" class="text-sm select-none" :class="{ 'text-theme-textmuted': disabled }">
      {{ label }}
    </span>
    <slot></slot>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  value?: string | number | boolean
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.checked)
}
</script>
