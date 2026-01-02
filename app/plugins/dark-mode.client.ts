/**
 * Client-side plugin to sync theme state with document element.
 * This ensures UnoCSS dark mode styles work correctly and injects
 * theme-specific CSS variables.
 */
export default defineNuxtPlugin({
  name: 'dark-mode',
  setup() {
    const uiStore = useUiStore()

    // Watch for theme changes and apply to document element
    watch(
      () => uiStore.currentTheme,
      theme => {
        if (typeof window !== 'undefined') {
          const isDark = theme.metadata.variant === 'dark'

          // Apply dark/light class for UnoCSS
          if (isDark) {
            document.documentElement.classList.add('dark')
            document.documentElement.classList.remove('light')
          } else {
            document.documentElement.classList.remove('dark')
            document.documentElement.classList.add('light')
          }

          // Inject theme-specific CSS variables
          const variables = generateThemeVariables(theme)
          Object.entries(variables).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value)
          })

          // Set background color for the whole page
          document.documentElement.style.backgroundColor = theme.colors.background

          // Set color-scheme for browser UI elements
          document.documentElement.style.colorScheme = theme.metadata.variant
        }
      },
      { immediate: true }
    )
  },
})
