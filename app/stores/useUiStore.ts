import { useStorage } from '@vueuse/core'

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
}

/**
 * UI state interface
 */
export interface UiState {
  isDark: boolean
}

/**
 * UI store with persistent state
 * Manages app-wide UI preferences like dark mode and toast notifications
 *
 * Uses useStorage from @vueuse/core for automatic localStorage sync.
 */
export const useUiStore = defineStore('ui', () => {
  // Dark mode state with localStorage persistence
  // useStorage automatically syncs with localStorage on client
  const isDark = useStorage('movies-deluxe-theme-dark', true)

  // Toast notifications state
  const toasts = ref<Toast[]>([])

  /**
   * Toggle dark mode (useStorage handles persistence automatically)
   */
  const toggleDarkMode = () => {
    isDark.value = !isDark.value
  }

  /**
   * Set dark mode explicitly (useStorage handles persistence automatically)
   */
  const setDarkMode = (value: boolean) => {
    isDark.value = value
  }

  /**
   * Show a toast notification
   */
  const showToast = (message: string, type: ToastType = 'success', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const toast: Toast = { id, message, type, duration }

    toasts.value.push(toast)

    // Auto-remove toast after duration
    setTimeout(() => {
      removeToast(id)
    }, duration)

    return id
  }

  /**
   * Remove a toast notification by ID
   */
  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  /**
   * Clear all toast notifications
   */
  const clearToasts = () => {
    toasts.value = []
  }

  return {
    // State
    isDark,
    toasts,

    // Actions
    toggleDarkMode,
    setDarkMode,
    showToast,
    removeToast,
    clearToasts,
  }
})
