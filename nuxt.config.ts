// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

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
          children: `
            (function() {
              const theme = localStorage.getItem('theme');
              const isDark = theme ? theme === 'dark' : true;
              if (isDark) {
                document.documentElement.classList.add('dark');
              }
            })();
          `,
          type: 'text/javascript',
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
})
