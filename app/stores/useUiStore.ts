import { useStorage } from '@vueuse/core'
import type { ThemeDefinition } from '~/types/theme'

/**
 * UI store with persistent state
 * Manages app-wide UI preferences like theme and dark mode
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

  return {
    // State
    currentThemeId,
    previewThemeId,
    currentTheme,
    isDark,
    isSearchOpen,
    scrollPositions,

    // Actions
    setTheme,
    previewTheme,
    toggleDarkMode,
    setDarkMode,
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
