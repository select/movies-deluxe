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
    },
  },

  // Vite configuration for SQLite WASM and workers
  vite: {
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          // Prevent Vite from transforming importScripts paths
          inlineDynamicImports: false,
        },
      },
    },
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
    server: {
      fs: {
        allow: ['..'],
      },
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  },

  // Nitro configuration for serving WASM files with correct MIME type
  nitro: {
    routeRules: {
      '/sqlite-wasm/*.wasm': {
        headers: {
          'Content-Type': 'application/wasm',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
      '/sqlite-wasm/*.js': {
        headers: {
          'Content-Type': 'text/javascript',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
    },
  },
})
