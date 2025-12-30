<template>
  <div class="relative">
    <!-- Items container with overflow handling -->
    <div
      ref="itemsContainer"
      class="flex flex-wrap gap-2 transition-all duration-300 ease-in-out md:overflow-hidden"
      :class="{
        'md:max-h-[5.5rem]': !isExpanded && isDesktop,
        'md:max-h-none': isExpanded || !isDesktop
      }"
    >
      <slot />
    </div>

    <!-- Show More/Less button with gradient background (desktop only) -->
    <button
      v-if="shouldShowToggle && isDesktop"
      class="cursor-pointer w-full flex items-end justify-center gap-1.5 text-xs font-medium transition-colors text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 h-11 flex"
      :class="{
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-900 dark:via-gray-900/90 dark:to-transparent': !isExpanded,
        'mt-2 bg-transparent': isExpanded
      }"
      @click="toggleExpanded"
    >
      <span>{{ isExpanded ? 'Show Less' : 'Show More' }}</span>
      <div
        class="i-mdi-chevron-down text-sm transition-transform duration-200"
        :class="{
          'rotate-180': isExpanded
        }"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /**
   * Number of lines to show when collapsed (desktop only)
   * Mobile always shows all items
   */
  maxLines?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxLines: 2
})

const isDesktop = useMediaQuery('(min-width: 768px)')
const isExpanded = ref(false)
const itemsContainer = ref<HTMLElement>()
const shouldShowToggle = ref(false)

// Check if we need to show the toggle button
const checkOverflow = () => {
  if (!itemsContainer.value || !isDesktop.value) {
    shouldShowToggle.value = false
    return
  }

  // Temporarily expand to measure full height
  const wasExpanded = isExpanded.value
  isExpanded.value = true

  nextTick(() => {
    if (!itemsContainer.value) return

    const fullHeight = itemsContainer.value.scrollHeight
    const lineHeight = 36 // Approximate height per line (button height + gap)
    const maxHeight = props.maxLines * lineHeight

    shouldShowToggle.value = fullHeight > maxHeight

    // Restore previous state
    isExpanded.value = wasExpanded
  })
}

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

// Check overflow when component mounts and when items change
onMounted(() => {
  nextTick(checkOverflow)
})

// Watch for desktop/mobile changes
watch(isDesktop, (desktop) => {
  if (!desktop) {
    isExpanded.value = false
    shouldShowToggle.value = false
  } else {
    nextTick(checkOverflow)
  }
})

// Expose method for parent to trigger overflow check
defineExpose({
  checkOverflow
})
</script>
