/**
 * Client-side plugin to handle scroll restoration between page navigations.
 * Uses useUiStore to remember scroll positions for non-excluded routes.
 *
 * For pages with virtual grids (like /search), uses polling to wait for
 * the document to reach the required height before restoring scroll.
 */
export default defineNuxtPlugin({
  name: 'scroll-restoration',
  parallel: true,
  setup(nuxtApp) {
    const router = useRouter()
    const uiStore = useUiStore()

    // Routes that use virtual grids and need delayed scroll restoration
    const virtualGridRoutes = ['/search']

    // Helper to check if route should be excluded from scroll memory
    const isExcluded = (path: string) => {
      return (
        path === '/movie' ||
        path.startsWith('/movie/') ||
        path === '/admin' ||
        path.startsWith('/admin/')
      )
    }

    // Helper to check if route uses virtual grid
    const usesVirtualGrid = (path: string) => {
      return virtualGridRoutes.some(route => path === route || path.startsWith(route + '?'))
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
        if (usesVirtualGrid(path)) {
          // For virtual grid pages, poll until document is tall enough
          let attempts = 0
          const maxAttempts = 50 // 50 * 50ms = 2.5s max wait
          const poll = () => {
            const docHeight = document.documentElement.scrollHeight
            if (docHeight >= savedPosition + window.innerHeight || attempts >= maxAttempts) {
              window.scrollTo({ top: savedPosition, behavior: 'instant' })
            } else {
              attempts++
              setTimeout(poll, 50)
            }
          }
          // Start polling after a short delay for initial render
          setTimeout(poll, 50)
        } else {
          // For regular pages, restore immediately with fallback
          nextTick(async () => {
            await nextTick()
            window.scrollTo({ top: savedPosition, behavior: 'instant' })

            // Fallback for slow-loading content
            requestAnimationFrame(() => {
              if (Math.abs(window.scrollY - savedPosition) > 10) {
                window.scrollTo({ top: savedPosition, behavior: 'instant' })
              }
            })
          })
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' })
      }
    })
  },
})
