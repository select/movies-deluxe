import type { RouterConfig } from '@nuxt/schema'

// https://router.vuejs.org/api/interfaces/routeroptions.html
export default <RouterConfig>{
  scrollBehavior(_to, _from, _savedPosition) {
    // Disable automatic scroll restoration - we handle it manually
    // This prevents Nuxt from interfering with our custom scroll restoration
    return false
  },
}
