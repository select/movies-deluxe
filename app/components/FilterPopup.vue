<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="fixed inset-0 z-[100] overflow-hidden flex flex-col">
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
          @click="$emit('close')"
        ></div>

        <!-- Popup Content -->
        <Transition name="pop" appear>
          <div
            ref="popupRef"
            class="absolute glass shadow-2xl overflow-hidden flex flex-col border border-theme-border/50"
            :style="popupStyle"
            :class="[
              isMobile
                ? 'bottom-0 left-0 right-0 rounded-t-3xl max-h-[85vh] w-full'
                : 'rounded-2xl max-w-xs',
            ]"
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-theme-border/30">
              <h3 class="text-xs font-bold text-theme-textmuted uppercase tracking-widest">
                {{ title }}
              </h3>
              <button
                class="p-1 hover:bg-theme-selection rounded-full transition-colors text-theme-textmuted hover:text-theme-text"
                @click="$emit('close')"
              >
                <div class="i-mdi-close text-lg"></div>
              </button>
            </div>

            <!-- Content -->
            <div class="p-4 overflow-y-auto scrollbar-thin max-h-[60vh] md:max-h-[400px]">
              <slot></slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import {
  useWindowSize,
  useBreakpoints,
  breakpointsTailwind,
  onKeyStroke,
  useScrollLock,
} from '@vueuse/core'

interface Props {
  isOpen: boolean
  title: string
  anchorEl?: HTMLElement | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const popupRef = ref<HTMLElement | null>(null)
const { width: windowWidth, height: windowHeight } = useWindowSize()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

// Scroll lock for body when popup is open
const isLocked = useScrollLock(typeof window !== 'undefined' ? document.body : null)

// Focus trap
const { activate, deactivate } = useFocusTrap(popupRef, {
  immediate: false,
  allowOutsideClick: true,
  escapeDeactivates: true,
  returnFocusOnDeactivate: true,
})

watch(
  () => props.isOpen,
  val => {
    isLocked.value = val
    if (val) {
      nextTick(() => {
        setTimeout(() => activate(), 50)
      })
    } else {
      deactivate()
    }
  }
)

// Escape key listener
onKeyStroke('Escape', e => {
  if (props.isOpen) {
    e.preventDefault()
    emit('close')
  }
})

const popupStyle = computed(() => {
  if (isMobile.value || !props.anchorEl) return {}

  const rect = props.anchorEl.getBoundingClientRect()
  const popupWidth = 320 // max-w-xs

  let left = rect.left
  let top = rect.bottom + 8

  // Adjust horizontal position if it goes off screen
  if (left + popupWidth > windowWidth.value - 16) {
    left = windowWidth.value - popupWidth - 16
  }
  if (left < 16) left = 16

  // Adjust vertical position if it goes off screen (flip to top)
  // We'll estimate popup height at 300px for this calculation if we don't have it yet
  const estimatedHeight = popupRef.value?.offsetHeight || 300
  if (top + estimatedHeight > windowHeight.value - 16) {
    top = rect.top - estimatedHeight - 8
  }

  // Ensure top is not off screen
  if (top < 16) top = 16

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${popupWidth}px`,
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pop-enter-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pop-leave-active {
  transition: all 0.15s ease-in;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

@media (max-width: 768px) {
  .pop-enter-from,
  .pop-leave-to {
    transform: translateY(100%) !important;
    opacity: 1;
    scale: 1;
  }
  .pop-enter-active,
  .pop-leave-active {
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1) !important;
  }
}
</style>
