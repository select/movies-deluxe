import { useStorage } from '@vueuse/core'

/**
 * UI state interface
 */
export interface UiState {
  isDark: boolean
}

/**
 * UI store with persistent state
 * Manages app-wide UI preferences like dark mode
 *
 * Uses useStorage from @vueuse/core for automatic localStorage sync.
 */
export const useUiStore = defineStore('ui', () => {
  // Dark mode state with localStorage persistence
  // useStorage automatically syncs with localStorage on client
  const isDark = useStorage('movies-deluxe-theme-dark', true)

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

  return {
    // State
    isDark,

    // Actions
    toggleDarkMode,
    setDarkMode,
  }
})
