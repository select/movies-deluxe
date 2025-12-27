/**
 * Client-side plugin to sync dark mode state with document element.
 * This ensures UnoCSS dark mode styles work correctly by applying
 * the 'dark' class to <html> element.
 */
export default defineNuxtPlugin({
  name: 'dark-mode',
  // Don't use enforce: 'pre' - we need Pinia to be initialized first
  setup() {
    const uiStore = useUiStore()

    // Watch for dark mode changes and apply to document element
    watch(
      () => uiStore.isDark,
      isDark => {
        if (typeof window !== 'undefined') {
          if (isDark) {
            document.documentElement.classList.add('dark')
            document.documentElement.style.backgroundColor = '#171717'
          } else {
            document.documentElement.classList.remove('dark')
            document.documentElement.style.backgroundColor = '#ffffff'
          }
        }
      },
      { immediate: true }
    )
  },
})
