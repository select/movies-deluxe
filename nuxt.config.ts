// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  // Set dev server port to 3003 (3001 is used by Open WebUI)
  devServer: {
    port: 3003,
  },

  // Modules
  modules: ['@unocss/nuxt', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/eslint'],

  // Pinia configuration for auto-importing stores
  pinia: {
    storesDirs: ['./stores/**'],
  },

  // Apply font-sans class to body element globally
  app: {
    head: {
      bodyAttrs: {
        class: 'font-sans',
      },
      script: [
        {
          innerHTML: `
            // Apply dark mode immediately to prevent flash
            (function() {
              const isDark = localStorage.getItem('movies-deluxe-theme-dark');
              const prefersDark = isDark === null ? true : isDark === 'true';
              if (prefersDark) {
                document.documentElement.classList.add('dark');
                // Set body background immediately before CSS loads
                document.documentElement.style.backgroundColor = '#171717';
                document.body.style.backgroundColor = '#171717';
              } else {
                // Set light mode background
                document.documentElement.style.backgroundColor = '#ffffff';
                document.body.style.backgroundColor = '#ffffff';
              }
            })();
          `,
          type: 'text/javascript',
        },
      ],
      style: [
        {
          innerHTML: `
            /* Prevent flash of unstyled content */
            html, body {
              margin: 0;
              padding: 0;
            }
            /* Splash screen to prevent FOUC during hydration */
            #app-splash {
              position: fixed;
              inset: 0;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              background: inherit; /* Inherit from body inline style */
              transition: opacity 0.3s ease-out;
            }
            #app-splash.hidden {
              opacity: 0;
              pointer-events: none;
            }
            /* Spinner animation */
            .splash-spinner {
              width: 48px;
              height: 48px;
              border: 4px solid rgba(0, 0, 0, 0.1);
              border-top-color: #525252;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
            }
            .dark .splash-spinner {
              border-color: rgba(255, 255, 255, 0.1);
              border-top-color: #00DC82;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `,
        },
      ],
    },
  },

  // Vite configuration for SQLite WASM support
  vite: {
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    worker: {
      format: 'es',
    },
  },

  // Nitro configuration for serving WASM files with correct MIME type
  nitro: {
    routeRules: {
      '/**/*.wasm': {
        headers: {
          'Content-Type': 'application/wasm',
        },
      },
    },
  },

  runtimeConfig: {
    // Server-side only
    minMovieDurationMinutes: 40,
  },
})
