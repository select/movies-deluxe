import { useStorage } from '@vueuse/core'
import type { ThemeDefinition } from '~/types/theme'

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
 * UI store with persistent state
 * Manages app-wide UI preferences like dark mode and toast notifications
 *
 * Uses useStorage from @vueuse/core for automatic localStorage sync.
 */
export const useUiStore = defineStore('ui', () => {
  // Theme state with localStorage persistence
  const currentThemeId = useStorage('movies-deluxe-theme-id', DEFAULT_DARK_THEME_ID)

  // Preview theme state (not persistent)
  const previewThemeId = ref<string | null>(null)

  // Derived theme definition
  const currentTheme = computed<ThemeDefinition>(() => {
    return getThemeWithFallback(previewThemeId.value || currentThemeId.value)
  })

  // Backward compatibility: isDark derived from current theme
  const isDark = computed({
    get: () => currentTheme.value.metadata.variant === 'dark',
    set: (value: boolean) => {
      if (value) {
        setTheme(DEFAULT_DARK_THEME_ID)
      } else {
        setTheme(DEFAULT_LIGHT_THEME_ID)
      }
    },
  })

  // Toast notifications state
  const toasts = ref<Toast[]>([])
  const toastQueue = ref<Toast[]>([])
  const MAX_VISIBLE_TOASTS = 2

  // Search overlay state
  const isSearchOpen = ref(false)

  // Scroll positions state (not persistent across sessions)
  const scrollPositions = ref<Record<string, number>>({})

  /**
   * Set theme by ID
   */
  const setTheme = (themeId: string) => {
    currentThemeId.value = themeId
    previewThemeId.value = null
  }

  /**
   * Save scroll position for a route
   */
  const saveScrollPosition = (route: string, position: number) => {
    scrollPositions.value[route] = position
  }

  /**
   * Get scroll position for a route
   */
  const getScrollPosition = (route: string): number | undefined => {
    return scrollPositions.value[route]
  }

  /**
   * Clear scroll position for a route
   */
  const clearScrollPosition = (route: string) => {
    delete scrollPositions.value[route]
  }

  /**
   * Preview theme by ID
   */
  const previewTheme = (themeId: string | null) => {
    previewThemeId.value = themeId
  }

  /**
   * Toggle dark mode (switches between default dark and light themes)
   */
  const toggleDarkMode = () => {
    isDark.value = !isDark.value
  }

  /**
   * Set dark mode explicitly
   */
  const setDarkMode = (value: boolean) => {
    isDark.value = value
  }

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
    currentThemeId,
    previewThemeId,
    currentTheme,
    isDark,
    toasts,
    toastQueue,
    isSearchOpen,
    scrollPositions,

    // Actions
    setTheme,
    previewTheme,
    toggleDarkMode,
    setDarkMode,
    showToast,
    removeToast,
    clearToasts,
    toggleSearch: () => (isSearchOpen.value = !isSearchOpen.value),
    setSearchOpen: (value: boolean) => (isSearchOpen.value = value),
    saveScrollPosition,
    getScrollPosition,
    clearScrollPosition,
  }
})

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot))
}
