// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: true,

  // Prerender pages with social card meta tags
  // Pages that don't need SSR stay as SPA (client-side only)
  routeRules: {
    '/search': { ssr: false },
    '/liked': { ssr: false },
    '/admin/**': { ssr: false },
  },
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
  modules: ['@unocss/nuxt', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/eslint', 'nuxt-explicit-imports'],

  explicitImports: {
    mode: 'strict',
  },

  // Apply font-sans class to body element globally
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'describedby' as 'alternate', href: '/llms.txt', type: 'text/markdown' },
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
          `,
        },
      ],
    },
  },

  // Vite configuration for SQLite WASM support
  vite: {
    optimizeDeps: {
      include: ['@vueuse/integrations/useFocusTrap', 'fuse.js'],
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
    plugins: [
      // Stub ?worker imports during SSR build (workers only run client-side)
      {
        name: 'stub-workers-ssr',
        enforce: 'pre',
        resolveId(id, _importer, options) {
          if (options?.ssr && id.includes('?worker')) {
            return '\0worker-stub'
          }
        },
        load(id) {
          if (id === '\0worker-stub') {
            return 'export default class WorkerStub {}'
          }
        },
      },
    ],
  },

  // Ignore folders with large file counts and build output directories from Nuxt & Vite file watchers
  ignore: ['public/posters', 'public/movies', '.output', 'dist'],

  // Nitro configuration for serving WASM files with correct MIME type
  nitro: {
    ...(process.env.NITRO_OUTPUT_DIR ? { output: { dir: process.env.NITRO_OUTPUT_DIR } } : {}),
    // Externalize packages that have native Node.js dependencies incompatible with Node 24
    // onnxruntime-node doesn't support Node 24's NAPI v10 yet
    externals: {
      inline: [],
      external: ['onnxruntime-node', '@huggingface/transformers'],
    },
    hooks: {
      async 'prerender:routes'(routes) {
        if (process.env.SKIP_PRERENDER === '1' || process.env.SKIP_PRERENDER === 'true') {
          console.log('[prerender] Skipping route registration (SKIP_PRERENDER enabled)')
          return
        }

        // Read all movie IDs from SQLite and register as prerender routes
        const Database = (await import('better-sqlite3')).default
        const { resolve } = await import('path')
        const dbPath = resolve('public/data/movies.db')
        const db = new Database(dbPath, { readonly: true })
        const rows = db.prepare('SELECT movieId FROM movies').all() as { movieId: string }[]
        db.close()
        for (const row of rows) {
          routes.add(`/movie/${row.movieId}`)
        }
        console.log(`[prerender] Registered ${rows.length} movie routes`)

        // Register collection routes
        const { readFileSync } = await import('fs')
        const collectionsPath = resolve('public/data/collections.json')
        const collections = JSON.parse(readFileSync(collectionsPath, 'utf-8'))
        const collectionIds = Object.keys(collections).filter(k => k !== '_schema')
        for (const id of collectionIds) {
          routes.add(`/collections/${id}`)
        }
        routes.add('/collections')
        routes.add('/')
        routes.add('/sitemap.xml')
        console.log(
          `[prerender] Registered ${collectionIds.length} collection routes + home + sitemap`
        )
      },
    },
    routeRules: {
      '/**/*.wasm': {
        headers: {
          'Content-Type': 'application/wasm',
        },
      },
      // Cache ML model files permanently (immutable content)
      '/models/**/*.onnx': {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
      '/models/**/*.json': {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
      '/models/**/*.txt': {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
    },
  },

  runtimeConfig: {
    // Public (exposed to client)
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://mdlx.org',
    },
    // Server-side only
    minMovieDurationMinutes: 40,
    googleApiKey: process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY,
    googleSearchCx: process.env.GOOGLE_SEARCH_CX,
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
  },
})
