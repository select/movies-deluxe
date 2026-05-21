/**
 * Sets a canonical URL on every page to tell Google that https://mdlx.org
 * is the preferred domain. Fixes "Duplicate without user-selected canonical"
 * and "Page with redirect" issues in Google Search Console.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const {
    public: { siteUrl },
  } = useRuntimeConfig()

  useHead({
    link: [
      {
        rel: 'canonical',
        href: computed(() => {
          // Remove trailing slash except for root
          const path = route.path === '/' ? '/' : route.path.replace(/\/$/, '')
          return `${siteUrl}${path}`
        }),
      },
    ],
  })
})
