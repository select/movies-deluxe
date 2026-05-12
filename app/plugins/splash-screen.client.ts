/**
 * Client-side plugin to hide splash screen after Vue hydration is complete.
 * Database initialization happens in the background — pages show loading states until ready.
 */
export default defineNuxtPlugin({
  name: 'splash-screen',
  enforce: 'post', // Run after other plugins
  hooks: {
    'app:mounted': async () => {
      if (typeof window !== 'undefined') {
        const splash = document.getElementById('app-splash')
        if (splash) {
          // Start database initialization in the background (don't block render)
          const movieStore = useMovieStore()
          movieStore.loadFromFile()

          // Hide splash screen immediately after hydration
          setTimeout(() => {
            splash.classList.add('hidden')
            setTimeout(() => splash.remove(), 300)
          }, 100)
        }
      }
    },
  },
})
