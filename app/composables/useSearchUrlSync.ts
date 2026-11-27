import type { LocationQueryValue } from 'vue-router'
import { useRoute, useRouter } from '#app'
import { storeToRefs } from '#imports'
import { onMounted, watch } from 'vue'
import { useMovieStore } from '~/stores/useMovieStore'
import {
  areUrlQueriesEqual,
  hasSearchUrlParams,
  parseSearchUrlQuery,
  SEARCH_URL_PARAM_KEYS,
  serializeFiltersToUrlQuery,
} from '~/utils/searchUrlParams'

const SEARCH_PARAM_SET = new Set<string>(SEARCH_URL_PARAM_KEYS)

export function useSearchUrlSync() {
  const route = useRoute()
  const router = useRouter()
  const movieStore = useMovieStore()
  const { filters } = storeToRefs(movieStore)

  const syncFiltersToUrl = () => {
    if (import.meta.server || route.path !== '/search') return

    const nextSearchQuery = serializeFiltersToUrlQuery(filters.value)
    if (areUrlQueriesEqual(route.query, nextSearchQuery)) return

    const mergedQuery: Record<string, LocationQueryValue | LocationQueryValue[]> = {}
    for (const [key, val] of Object.entries(route.query)) {
      if (!SEARCH_PARAM_SET.has(key) && val !== undefined) {
        mergedQuery[key] = val
      }
    }
    Object.assign(mergedQuery, nextSearchQuery)

    router.replace({ query: mergedQuery })
  }

  // Restore filters from URL immediately if search params are present
  if (route.path === '/search' && hasSearchUrlParams(route.query)) {
    filters.value = parseSearchUrlQuery(route.query)
  }

  onMounted(() => {
    if (route.path !== '/search') return

    if (hasSearchUrlParams(route.query)) {
      const parsed = parseSearchUrlQuery(route.query)
      const currentSerialized = serializeFiltersToUrlQuery(filters.value)
      const parsedSerialized = serializeFiltersToUrlQuery(parsed)
      if (JSON.stringify(currentSerialized) !== JSON.stringify(parsedSerialized)) {
        filters.value = parsed
      }
    }
    syncFiltersToUrl()
  })

  // Reflect filter/query/mode/sort changes in the URL
  watch(
    () => serializeFiltersToUrlQuery(filters.value),
    () => {
      syncFiltersToUrl()
    }
  )

  // Restore filters when URL query changes externally (e.g. back/forward or deep-link navigation)
  watch(
    () => route.query,
    newQuery => {
      if (import.meta.server || route.path !== '/search') return

      const currentSerialized = serializeFiltersToUrlQuery(filters.value)
      if (areUrlQueriesEqual(newQuery, currentSerialized)) return

      filters.value = parseSearchUrlQuery(newQuery)
    },
    { deep: true }
  )
}
