/**
 * Toast notification type
 */
export type ToastType = 'success' | 'error' | 'info' | 'warning'

/**
 * Toast notification interface
 */
export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
  timerId?: ReturnType<typeof setTimeout>
}

/**
 * Toast store
 * Manages toast notifications with queueing support
 */
export const useToastStore = defineStore('toast', () => {
  // Toast notifications state
  const toasts = ref<Toast[]>([])
  const toastQueue = ref<Toast[]>([])
  const MAX_VISIBLE_TOASTS = 2

  /**
   * Process the toast queue - show queued toasts when space is available
   */
  const processToastQueue = () => {
    while (toasts.value.length < MAX_VISIBLE_TOASTS && toastQueue.value.length > 0) {
      const queuedToast = toastQueue.value.shift()
      if (queuedToast) {
        toasts.value.push(queuedToast)

        // Set up auto-removal timer
        queuedToast.timerId = setTimeout(() => {
          removeToast(queuedToast.id)
        }, queuedToast.duration)
      }
    }
  }

  /**
   * Show a toast notification
   */
  const showToast = (message: string, type: ToastType = 'success', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const toast: Toast = { id, message, type, duration }

    if (toasts.value.length < MAX_VISIBLE_TOASTS) {
      // Show immediately
      toasts.value.push(toast)

      // Set up auto-removal timer
      toast.timerId = setTimeout(() => {
        removeToast(id)
      }, duration)
    } else {
      // Add to queue
      toastQueue.value.push(toast)
    }

    return id
  }

  /**
   * Remove a toast notification by ID
   */
  const removeToast = (id: string) => {
    // Find and remove from visible toasts
    const toastIndex = toasts.value.findIndex(t => t.id === id)
    if (toastIndex !== -1) {
      const toast = toasts.value[toastIndex]

      // Clear the timer if it exists
      if (toast?.timerId) {
        clearTimeout(toast.timerId)
      }

      toasts.value.splice(toastIndex, 1)

      // Process queue to show next toast
      processToastQueue()
      return
    }

    // If not found in visible toasts, remove from queue
    const queueIndex = toastQueue.value.findIndex(t => t.id === id)
    if (queueIndex !== -1) {
      const toast = toastQueue.value[queueIndex]

      // Clear the timer if it exists
      if (toast?.timerId) {
        clearTimeout(toast.timerId)
      }

      toastQueue.value.splice(queueIndex, 1)
    }
  }

  /**
   * Clear all toast notifications
   */
  const clearToasts = () => {
    // Clear all timers
    ;[...toasts.value, ...toastQueue.value].forEach(toast => {
      if (toast.timerId) {
        clearTimeout(toast.timerId)
      }
    })

    toasts.value = []
    toastQueue.value = []
  }

  return {
    // State
    toasts,
    toastQueue,

    // Actions
    showToast,
    removeToast,
    clearToasts,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastStore, import.meta.hot))
}
