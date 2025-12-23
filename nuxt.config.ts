// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Set dev server port to 3003 (3001 is used by Open WebUI)
  devServer: {
    port: 3003,
  },

  // Modules
  modules: ['@unocss/nuxt', '@pinia/nuxt', '@vueuse/nuxt'],

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
})
