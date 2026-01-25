/**
 * Client-side plugin to hide splash screen after Vue hydration is complete
 * and database is ready. This ensures smooth theme transition without FOUC
 * and prevents showing content before data is available.
 */
export default defineNuxtPlugin({
  name: 'splash-screen',
  enforce: 'post', // Run after other plugins
  hooks: {
    'app:mounted': async () => {
      // Hide splash screen after app is fully mounted, hydrated, and database is ready
      if (typeof window !== 'undefined') {
        const splash = document.getElementById('app-splash')
        if (splash) {
          try {
            // Initialize database and wait for it to be ready
            const movieStore = useMovieStore()
            await movieStore.loadFromFile()

            // Small delay to ensure styles are fully applied
            setTimeout(() => {
              splash.classList.add('hidden')
              // Remove from DOM after fade-out transition completes
              setTimeout(() => splash.remove(), 300)
            }, 100)
          } catch {
            // Failed to initialize database
            // Still hide splash screen even if database fails
            setTimeout(() => {
              splash.classList.add('hidden')
              setTimeout(() => splash.remove(), 300)
            }, 100)
          }
        }
      }
    },
  },
})
