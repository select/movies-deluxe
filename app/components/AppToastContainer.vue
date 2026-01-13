<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2" appear>
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto p-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 min-w-[300px] max-w-md transform-gpu"
        :class="toastClasses(toast.type)"
      >
        <div :class="toastIcon(toast.type)"></div>
        <span class="flex-1">{{ toast.message }}</span>
        <button
          class="p-1 hover:bg-white/20 rounded transition-colors"
          @click="removeToast(toast.id)"
        >
          <div class="i-mdi-close text-lg"></div>
        </button>
      </div>
    </TransitionGroup>

    <!-- Queue indicator (optional visual feedback) -->
    <div
      v-if="toastQueue.length > 0"
      class="pointer-events-none text-xs text-gray-400 text-center opacity-60"
    >
      +{{ toastQueue.length }} more
    </div>
  </div>
</template>

<script setup lang="ts">
const { toasts, toastQueue, removeToast } = useToastStore()

type ToastType = 'success' | 'error' | 'info' | 'warning'

const toastClasses = (type: ToastType) => {
  const classes = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-yellow-600',
  }
  return classes[type] || classes.info
}

const toastIcon = (type: ToastType) => {
  const icons = {
    success: 'i-mdi-check-circle text-lg',
    error: 'i-mdi-alert-circle text-lg',
    info: 'i-mdi-information text-lg',
    warning: 'i-mdi-alert text-lg',
  }
  return icons[type] || icons.info
}
</script>

<style scoped>
/* Enhanced toast animations */
.toast-enter-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.toast-leave-active {
  transition: all 0.3s ease-in;
}

.toast-move {
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* Enter animation: zoom in from right */
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.8);
}

/* Leave animation: slide out to right */
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

/* Ensure smooth GPU acceleration */
.toast-enter-active,
.toast-leave-active,
.toast-move {
  will-change: transform, opacity;
}
</style>
