/**
 * Client-side plugin to handle scroll restoration between page navigations.
 * Uses useUiStore to remember scroll positions for non-excluded routes.
 */
export default defineNuxtPlugin({
  name: 'scroll-restoration',
  parallel: true,
  setup(nuxtApp) {
    const router = useRouter()
    const uiStore = useUiStore()

    // Helper to check if route should be excluded from scroll memory
    const isExcluded = (path: string) => {
      return (
        path === '/movie' ||
        path.startsWith('/movie/') ||
        path === '/admin' ||
        path.startsWith('/admin/')
      )
    }

    // Save scroll position before navigation
    router.beforeEach((to, from) => {
      if (import.meta.client && !isExcluded(from.path)) {
        uiStore.saveScrollPosition(from.fullPath, window.scrollY)
      }
    })

    // Restore scroll position after navigation completes
    nuxtApp.hook('page:finish', () => {
      const { path, fullPath } = router.currentRoute.value

      if (isExcluded(path)) {
        window.scrollTo({ top: 0, behavior: 'instant' })
        return
      }

      const savedPosition = uiStore.getScrollPosition(fullPath)
      if (savedPosition !== undefined && savedPosition > 0) {
        // Use multiple ticks and requestAnimationFrame to ensure DOM is updated
        // and virtual grids have had a chance to calculate their height
        nextTick(async () => {
          await nextTick()
          window.scrollTo({ top: savedPosition, behavior: 'instant' })

          // Fallback for slow-loading content/virtual grids
          requestAnimationFrame(() => {
            if (Math.abs(window.scrollY - savedPosition) > 10) {
              window.scrollTo({ top: savedPosition, behavior: 'instant' })
            }
          })
        })
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' })
      }
    })
  },
})
