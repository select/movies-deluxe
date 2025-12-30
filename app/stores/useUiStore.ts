import { useStorage } from '@vueuse/core'
import { getThemeWithFallback, DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID } from '~/utils/themes'
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

  // Search overlay state
  const isSearchOpen = ref(false)

  /**
   * Set theme by ID
   */
  const setTheme = (themeId: string) => {
    currentThemeId.value = themeId
    previewThemeId.value = null
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
    currentThemeId,
    previewThemeId,
    currentTheme,
    isDark,
    toasts,
    isSearchOpen,

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
  }
})
