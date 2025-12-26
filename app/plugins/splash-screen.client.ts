/**
 * Client-side plugin to hide splash screen after Vue hydration is complete.
 * This ensures smooth theme transition without FOUC.
 */
export default defineNuxtPlugin({
  name: 'splash-screen',
  enforce: 'post', // Run after other plugins
  hooks: {
    'app:mounted': () => {
      // Hide splash screen after app is fully mounted and hydrated
      if (typeof window !== 'undefined') {
        const splash = document.getElementById('app-splash')
        if (splash) {
          // Small delay to ensure styles are fully applied
          setTimeout(() => {
            splash.classList.add('hidden')
            // Remove from DOM after fade-out transition completes
            setTimeout(() => splash.remove(), 300)
          }, 100)
        }
      }
    },
  },
})
