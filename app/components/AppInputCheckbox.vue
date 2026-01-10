<template>
  <label
    class="flex items-center gap-2 cursor-pointer group"
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
  >
    <div
      class="flex items-center justify-center w-5 h-5 transition-colors"
      :class="{
        'text-theme-primary': checked,
        'text-theme-textmuted group-hover:text-theme-text': !checked,
      }"
      role="checkbox"
      :aria-checked="checked"
      :aria-disabled="disabled"
    >
      <div v-if="checked" class="i-mdi-checkbox-marked text-xl" />
      <div v-else class="i-mdi-checkbox-blank-outline text-xl" />
    </div>
    <input
      :checked="checked"
      type="checkbox"
      :value="value"
      :disabled="disabled"
      class="sr-only"
      @change="handleChange"
    />
    <span v-if="label" class="text-sm select-none" :class="{ 'text-theme-textmuted': disabled }">
      {{ label }}
    </span>
    <slot />
  </label>
</template>

<script setup lang="ts">
interface Props {
  checked: boolean
  value?: string | number | boolean
  label?: string
  disabled?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  change: [checked: boolean]
}>()

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('change', target.checked)
}
</script>
