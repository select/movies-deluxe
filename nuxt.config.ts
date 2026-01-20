// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  // Set dev server port to 3003 (3001 is used by Open WebUI)
  devServer: {
    port: 3003,
  },

  // TypeScript configuration
  typescript: {
    typeCheck: false, // Disable during dev for performance, use pnpm typecheck manually
    tsConfig: {
      compilerOptions: {
        strict: true,
        useUnknownInCatchVariables: true,
      },
    },
  },

  // Modules
  modules: ['@unocss/nuxt', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/eslint'],

  // Apply font-sans class to body element globally
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
      bodyAttrs: {
        class: 'font-sans',
      },
      script: [
        {
          // Apply dark mode immediately to prevent flash
          innerHTML: `
            (function() {
              const isDark = localStorage.getItem('movies-deluxe-theme-dark');
              const prefersDark = isDark === null ? true : isDark === 'true';
              if (prefersDark) {
                document.documentElement.classList.add('dark');
                // Set background immediately before CSS loads
                document.documentElement.style.backgroundColor = '#171717';
              } else {
                // Set light mode background
                document.documentElement.style.backgroundColor = '#ffffff';
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
            html {
              background-color: inherit;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: inherit;
            }
            /* Splash screen to prevent FOUC during hydration */
            #app-splash {
              position: fixed;
              inset: 0;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #f8fafc; /* Light neutral background */
              transition: opacity 0.3s ease-out;
            }
            .dark #app-splash {
              background: #171717; /* Dark neutral background */
            }
            #app-splash.hidden {
              opacity: 0;
              pointer-events: none;
            }

            /* Splash content container */
            .splash-content {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }

            /* Logo styling and animations */
            .splash-logo {
              width: 240px;
              height: auto;
              opacity: 0;
              animation: logoFadeIn 0.8s ease-out 0.2s forwards;
            }
            .splash-logo svg {
              width: 100%;
              height: auto;
              fill: #475569; /* Neutral slate color for light mode */
              animation: logoPulse 2s ease-in-out infinite, logoShimmer 3s ease-in-out infinite;
            }
            .dark .splash-logo svg {
              fill: #abb2bf; /* Light neutral for dark mode */
            }

            /* Logo animations */
            @keyframes logoFadeIn {
              from {
                opacity: 0;
                transform: translateY(-20px) scale(0.9);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
            @keyframes logoPulse {
              0%, 100% {
                opacity: 1;
                transform: scale(1);
              }
              50% {
                opacity: 0.7;
                transform: scale(1.05);
              }
            }
            @keyframes logoShimmer {
              0% {
                filter: brightness(1);
              }
              25% {
                filter: brightness(1.2);
              }
              50% {
                filter: brightness(0.8);
              }
              75% {
                filter: brightness(1.1);
              }
              100% {
                filter: brightness(1);
              }
            }
          `,
        },
      ],
    },
  },

  // Vite configuration for SQLite WASM support
  vite: {
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm', 'sqlite-wasm-vec', 'onnxruntime-web'],
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
    googleApiKey: process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY,
    googleSearchCx: process.env.GOOGLE_SEARCH_CX,
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
  },
})
