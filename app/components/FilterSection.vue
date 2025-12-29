<template>
  <div >
    <!-- Filter Title / Header (clickable on mobile) -->
    <button
      :class="[
        'flex items-center justify-between w-full px-2 py-1 rounded-md bg-gradient-to-r from-theme-selection to-transparent text-left group transition-all duration-500 md:cursor-default',
        highlight ? 'ring-2 ring-theme-primary ring-offset-2 ring-offset-theme-background scale-[1.02] shadow-lg' : ''
      ]"
      :aria-expanded="isExpanded"
      :disabled="isDesktop"
      @click="toggleSection"
    >
      <div class="flex items-center gap-2">
        <div
          v-if="icon"
          :class="['text-base text-theme-text-muted', icon]"
        />
        <h3 class="font-bold text-[10px] uppercase tracking-wider text-theme-text-muted">
          {{ title }}
        </h3>
      </div>

      <!-- Chevron (mobile only) -->
      <div
        class="i-mdi-chevron-down text-lg text-gray-400 transition-transform duration-300 md:hidden"
        :class="{ 'rotate-180': isExpanded }"
      />
    </button>

    <!-- Filter Content (collapsible on mobile) -->
    <div
      :class="[
        'transition-all duration-300 ease-in-out overflow-hidden',
        'md:max-h-none md:opacity-100 md:visible md:mt-3', // Always expanded on desktop
        isExpanded
          ? 'max-h-[2000px] opacity-100 visible mt-3'
          : 'max-h-0 opacity-0 invisible mt-0', // Collapsible on mobile
      ]"
    >
      <div class="space-y-2">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
  icon?: string
  defaultExpanded?: boolean
  highlight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  defaultExpanded: false,
  highlight: false,
})

const isDesktop = useMediaQuery('(min-width: 768px)')
const isExpanded = ref(props.defaultExpanded)

// On desktop, we want it always expanded
watchEffect(() => {
  if (isDesktop.value) {
    isExpanded.value = true
  }
})

const toggleSection = () => {
  if (!isDesktop.value) {
    isExpanded.value = !isExpanded.value
  }
}
</script>
