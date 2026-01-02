<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <TransitionGroup
      name="toast"
      tag="div"
      class="flex flex-col gap-2"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto p-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 min-w-[300px] max-w-md"
        :class="toastClasses(toast.type)"
      >
        <div :class="toastIcon(toast.type)" />
        <span class="flex-1">{{ toast.message }}</span>
        <button
          class="p-1 hover:bg-white/20 rounded transition-colors"
          @click="removeToast(toast.id)"
        >
          <div class="i-mdi-close text-lg" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
const { toasts, removeToast } = useUiStore()

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
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
