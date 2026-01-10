<template>
  <div>
    <!-- Overlay (visible when menu is open) -->
    <div v-if="isOpen" class="fixed inset-0 z-50 transition-opacity" @click="emit('close')"></div>

    <!-- Theme Menu Panel (mobile: bottom sheet, desktop: left sidebar) -->
    <div
      ref="themeMenuRef"
      class="fixed z-50 transition-all duration-300 ease-in-out glass shadow-2xl overflow-hidden flex flex-col bottom-0 left-0 right-0 rounded-t-2xl border-t border-theme-border/50 max-h-[90vh] md:top-0 md:left-0 md:bottom-0 md:right-auto md:h-full md:w-full md:max-w-xs md:rounded-none md:border-0 md:max-h-full"
      :class="{
        'translate-y-0 md:translate-x-0': isOpen,
        'translate-y-full md:translate-y-0 md:-translate-x-full': !isOpen,
      }"
    >
      <!-- Mobile Close Button (fixed position, same as menu button) -->
      <button
        class="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-theme-primary text-white shadow-lg hover:opacity-90 transition-all flex items-center justify-center z-[60]"
        aria-label="Close theme menu"
        @click="emit('close')"
      >
        <div class="i-mdi-close text-2xl"></div>
      </button>

      <!-- Header -->
      <div class="flex items-center justify-between p-4">
        <h2 class="text-lg font-semibold flex items-center gap-2 text-theme-text">
          <div class="i-mdi-palette text-xl"></div>
          Theme Selection
        </h2>
        <button
          class="p-2 hidden md:block hover:bg-theme-selection rounded-full transition-colors text-theme-text"
          aria-label="Close theme menu"
          @click="emit('close')"
        >
          <div class="i-mdi-close text-xl"></div>
        </button>
      </div>

      <!-- Separator -->
      <hr class="mx-4 my-0 border-theme-border/50" />

      <!-- Theme Content -->
      <div class="overflow-y-auto scrollbar-thin flex-1 md:h-[calc(100vh-4rem)] p-4">
        <div class="max-w-7xl mx-auto space-y-6">
          <!-- Dark Themes -->
          <div>
            <h4
              class="text-[10px] font-bold uppercase tracking-widest text-theme-textmuted mb-3 flex items-center gap-2"
            >
              <div class="i-material-symbols-light-dark-mode text-xs"></div>
              Dark Themes
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                v-for="theme in darkThemes"
                :key="theme.metadata.id"
                class="flex flex-col gap-2 p-2 rounded-xl border-2 transition-all text-left"
                :class="{
                  'border-theme-primary bg-theme-primary/10': currentThemeId === theme.metadata.id,
                  'border-theme-border/50 hover:border-theme-border bg-theme-surface/50':
                    currentThemeId !== theme.metadata.id,
                }"
                @click="setTheme(theme.metadata.id)"
                @mouseenter="previewTheme(theme.metadata.id)"
                @mouseleave="previewTheme(null)"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold truncate">{{ theme.metadata.name }}</span>
                  <div
                    v-if="currentThemeId === theme.metadata.id"
                    class="i-mdi-check-circle text-theme-primary text-xs"
                  ></div>
                </div>

                <!-- Color Swatches -->
                <div class="flex gap-1">
                  <div
                    class="w-3 h-3 rounded-full border border-black/10"
                    :style="{ backgroundColor: theme.colors.background }"
                  ></div>
                  <div
                    class="w-3 h-3 rounded-full border border-black/10"
                    :style="{ backgroundColor: theme.colors.primary }"
                  ></div>
                  <div
                    class="w-3 h-3 rounded-full border border-black/10"
                    :style="{ backgroundColor: theme.colors.accent }"
                  ></div>
                </div>
              </button>
            </div>
          </div>

          <!-- Light Themes -->
          <div>
            <h4
              class="text-[10px] font-bold uppercase tracking-widest text-theme-textmuted mb-3 flex items-center gap-2"
            >
              <div class="i-material-symbols-light-wb-sunny text-xs"></div>
              Light Themes
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                v-for="theme in lightThemes"
                :key="theme.metadata.id"
                class="flex flex-col gap-2 p-2 rounded-xl border-2 transition-all text-left"
                :class="{
                  'border-theme-primary bg-theme-primary/10': currentThemeId === theme.metadata.id,
                  'border-theme-border/50 hover:border-theme-border bg-theme-surface/50':
                    currentThemeId !== theme.metadata.id,
                }"
                @click="setTheme(theme.metadata.id)"
                @mouseenter="previewTheme(theme.metadata.id)"
                @mouseleave="previewTheme(null)"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold truncate">{{ theme.metadata.name }}</span>
                  <div
                    v-if="currentThemeId === theme.metadata.id"
                    class="i-mdi-check-circle text-theme-primary text-xs"
                  ></div>
                </div>

                <!-- Color Swatches -->
                <div class="flex gap-1">
                  <div
                    class="w-3 h-3 rounded-full border border-black/10"
                    :style="{ backgroundColor: theme.colors.background }"
                  ></div>
                  <div
                    class="w-3 h-3 rounded-full border border-black/10"
                    :style="{ backgroundColor: theme.colors.primary }"
                  ></div>
                  <div
                    class="w-3 h-3 rounded-full border border-black/10"
                    :style="{ backgroundColor: theme.colors.accent }"
                  ></div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { onClickOutside, useScrollLock } from '@vueuse/core'

interface Props {
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Theme support
const uiStore = useUiStore()
const { currentThemeId } = storeToRefs(uiStore)
const { setTheme, previewTheme } = uiStore
const themes = getAllThemes()
const darkThemes = computed(() => themes.filter(t => t.metadata.variant === 'dark'))
const lightThemes = computed(() => themes.filter(t => t.metadata.variant === 'light'))

// Focus trap for accessibility
const themeMenuRef = ref<HTMLElement | null>(null)

// Scroll lock for body when menu is open
const isLocked = useScrollLock(typeof window !== 'undefined' ? document.body : null)

// Close menu when clicking outside
onClickOutside(themeMenuRef, () => {
  if (props.isOpen) {
    emit('close')
  }
})

// Activate focus trap when menu is open
const { activate, deactivate } = useFocusTrap(themeMenuRef, {
  immediate: false,
  allowOutsideClick: false, // Prevent clicks outside while trap is active
  escapeDeactivates: false, // We handle Escape in the parent component
  returnFocusOnDeactivate: true,
  initialFocus: 'button[aria-label="Close theme menu"]', // Auto-focus close button
  fallbackFocus: () => themeMenuRef.value as HTMLElement, // Fallback if close button not found
})

// Watch for menu open/close to manage focus trap and scroll lock
watch(
  () => props.isOpen,
  isOpen => {
    isLocked.value = isOpen
    if (isOpen) {
      // Small delay to ensure DOM is ready and animation has started
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          activate()
        }, 50)
      }
    } else {
      deactivate()
    }
  }
)
</script>
