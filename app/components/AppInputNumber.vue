<template>
  <div class="space-y-2">
    <label
      v-if="label"
      class="text-sm font-medium text-gray-600 dark:text-gray-400"
    >
      {{ label }}
    </label>
    <input
      :value="modelValue"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :placeholder="placeholder"
      class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
      :class="{ 'opacity-50 cursor-not-allowed': disabled }"
      @input="handleInput"
    >
  </div>
</template>

<script setup lang="ts">
 
withDefaults(
  defineProps<{
    modelValue: number
    label?: string
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    label: undefined,
    min: undefined,
    max: undefined,
    step: 1,
    disabled: false,
    placeholder: undefined,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', Number(target.value))
}
</script>
