<template>
  <div
    v-if="isLocalhost"
    class="mt-8 p-6 bg-yellow-50 dark:bg-gray-800 border-2 border-yellow-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100"
  >
    <div class="flex items-center gap-2 mb-4 text-yellow-800 dark:text-gray-100">
      <div class="i-mdi-shield-edit text-2xl" />
      <h2 class="text-xl font-bold">
        Admin Curation
      </h2>
      <div
        v-if="movie.verified"
        class="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded"
      >
        <div class="i-mdi-check-decagram" />
        Verified
      </div>
      <span class="ml-auto text-xs font-mono bg-yellow-200 dark:bg-gray-700 px-2 py-1 rounded">
        localhost only
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left: Current Info & Search -->
      <div class="space-y-6">
        <div>
          <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300 mb-2">
            Source Info
          </h3>
          <div
            v-for="source in movie.sources"
            :key="source.id"
            class="bg-white dark:bg-gray-800/50 p-3 rounded border border-yellow-100 dark:border-gray-700 mb-2"
          >
            <div class="flex items-center gap-2 mb-1">
              <div
                :class="source.type === 'youtube' ? 'i-mdi-youtube text-red-600' : 'i-mdi-bank text-blue-600'"
                class="text-lg"
              />
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ source.type }}</span>
              <button
                class="ml-auto p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove source"
                @click="removeSource(source.id)"
              >
                <div class="i-mdi-close" />
              </button>
            </div>

            <!-- Original title from source -->
            <div
              v-if="source.title"
              class="mb-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-xs"
            >
              <span class="font-medium text-gray-700 dark:text-gray-300">Original title:</span>
              <span class="text-gray-600 dark:text-gray-400 ml-1">{{ source.title }}</span>
            </div>
            <p
              v-if="source.description"
              class="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-wrap"
            >
              {{ source.description.length > 1000 ? source.description.substring(0, 1000) + '...' : source.description }}
            </p>
            <p
              v-else
              class="text-xs italic text-gray-400"
            >
              No description available in database
            </p>

            <div class="mt-3 pt-2 border-t border-yellow-50 dark:border-gray-700">
              <div class="flex gap-1 mb-2">
                <input
                  v-model="sourceSearchTitles[source.id]"
                  type="text"
                  class="flex-1 px-2 py-1 text-[10px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Search query..."
                  @keyup.enter="handleGoogleSearch(sourceSearchTitles[source.id])"
                >
                <button
                  class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors"
                  @click="handleGoogleSearch(sourceSearchTitles[source.id])"
                >
                  Search
                </button>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="source.description"
                  class="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-[10px] font-bold rounded transition-colors"
                  @click="searchByDescription(source)"
                >
                  Search Desc
                </button>
                <button
                  v-if="source.title && source.description"
                  class="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-[10px] font-bold rounded transition-colors"
                  @click="searchBoth(source)"
                >
                  Search Both
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300">
            Search OMDB
          </h3>
          <div class="flex gap-2">
            <input
              v-model.trim="searchTitle"
              type="text"
              placeholder="Movie Title"
              class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 text-sm"
              @keyup.enter="handleSearch"
            >
            <input
              v-model.trim="searchYear"
              type="text"
              placeholder="Year"
              class="w-20 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 text-sm"
              @keyup.enter="handleSearch"
            >
            <button
              class="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-bold transition-colors disabled:opacity-50"
              :disabled="isSearching"
              @click="handleSearch"
            >
              <div
                v-if="isSearching"
                class="i-mdi-loading animate-spin"
              />
              <span v-else>Search</span>
            </button>
          </div>

          <div class="pt-2">
            <div class="flex items-center gap-2 mb-2">
              <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300">
                Direct IMDB ID
              </h3>
            </div>
            <div class="flex gap-2">
              <input
                v-model.trim="imdbIdInput"
                type="text"
                placeholder="tt1234567"
                class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 text-sm font-mono"
                @keyup.enter="handleDirectImdbFetch"
              >
              <button
                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors disabled:opacity-50"
                :disabled="isSearching || !imdbIdInput"
                @click="handleDirectImdbFetch"
              >
                Fetch
              </button>
            </div>
          </div>

          <div
            v-if="searchError"
            class="text-red-500 text-sm"
          >
            {{ searchError }}
          </div>
        </div>

        <div class="pt-4 border-t border-yellow-200 dark:border-gray-700 flex flex-wrap gap-4">
          <button
            v-if="!movie.verified"
            class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors text-sm font-bold disabled:opacity-50"
            :disabled="isSearching"
            @click="verifyMovie"
          >
            <div class="i-mdi-check-decagram text-lg" />
            Mark as Verified
          </button>
          <button
            class="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors text-sm font-bold disabled:opacity-50"
            :disabled="isSearching"
            @click="removeMetadata"
          >
            <div class="i-mdi-delete-sweep text-lg" />
            Remove All Metadata
          </button>
        </div>

        <!-- Collections Management -->
        <div class="pt-6 border-t border-yellow-200 dark:border-gray-700">
          <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300 mb-3">
            Collections
          </h3>
          <div class="flex flex-wrap gap-2 mb-4">
            <div
              v-for="collection in movieCollections"
              :key="collection.id"
              class="flex items-center gap-2 px-3 py-1.5 bg-theme-primary/10 border border-theme-primary/30 rounded-lg text-sm"
            >
              <div class="i-mdi:movie-roll text-theme-primary" />
              <span class="font-medium">{{ collection.name }}</span>
              <button
                class="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 transition-colors"
                title="Remove from collection"
                @click="removeFromCollection(collection.id)"
              >
                <div class="i-mdi-close text-xs" />
              </button>
            </div>
            <div
              v-if="movieCollections.length === 0"
              class="text-sm text-gray-500 italic py-1.5"
            >
              Not in any collections
            </div>
          </div>

          <div class="flex gap-2">
            <select
              v-model="selectedCollectionId"
              class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option
                value=""
                disabled
              >
                Add to collection...
              </option>
              <option
                v-for="c in availableCollections"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
            <button
              class="px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded font-bold transition-colors disabled:opacity-50"
              :disabled="!selectedCollectionId || isUpdatingCollection"
              @click="addToCollection"
            >
              <div
                v-if="isUpdatingCollection"
                class="i-mdi-loading animate-spin"
              />
              <span v-else>Add</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Search Results -->
      <div>
        <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300 mb-2">
          Search Results
        </h3>
        <div
          v-if="searchResults.length > 0"
          class="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin"
        >
          <div
            v-for="result in searchResults"
            :key="result.imdbID"
            class="flex gap-3 p-2 bg-white dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700 hover:border-yellow-400 dark:hover:border-gray-500 transition-colors group"
          >
            <img
              :src="result.Poster !== 'N/A' ? result.Poster : '/favicon.ico'"
              class="w-12 h-18 object-cover rounded"
              alt="Poster"
            >
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-sm truncate text-gray-900 dark:text-gray-100">
                {{ result.Title }}
              </h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ result.Year }} • {{ result.Type }}
              </p>
              <p class="text-[10px] font-mono text-gray-400">
                {{ result.imdbID }}
              </p>
            </div>
            <button
              class="self-center px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              :disabled="isSearching"
              @click="selectMovie(result.imdbID)"
            >
              Select
            </button>
          </div>
        </div>
        <div
          v-else-if="!isSearching"
          class="h-[200px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <div class="i-mdi-magnify text-4xl mb-2" />
          <p class="text-sm">
            Search results will appear here
          </p>
        </div>

        <!-- Google Results -->
        <div
          v-if="googleResults.length > 0"
          id="google-results"
          class="mt-8 pt-6 border-t border-yellow-200 dark:border-gray-700"
        >
          <div class="flex items-center gap-2 mb-3">
            <div class="i-mdi-google text-blue-600" />
            <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300">
              Google Results (IMDb)
            </h3>
          </div>
          <div class="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            <div
              v-for="result in googleResults"
              :key="result.imdbID"
              class="flex gap-3 p-2 bg-white dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-gray-500 transition-colors group"
            >
              <div class="w-12 h-18 bg-gray-100 dark:bg-gray-700 flex items-center justify-center rounded">
                <div class="i-mdi-movie-open text-2xl text-gray-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-bold text-sm truncate text-gray-900 dark:text-gray-100">
                  {{ result.Title }}
                </h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ result.Year }} • {{ result.Type }}
                </p>
                <p class="text-[10px] font-mono text-gray-400">
                  {{ result.imdbID }}
                </p>
              </div>
              <button
                class="self-center px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                :disabled="isSearching"
                @click="selectMovie(result.imdbID)"
              >
                Select
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getPrimaryTitle, cleanTitleForSearch } from '../../shared/utils/movieTitle'
import type { MovieEntry, MovieSource, OMDBSearchResult, OMDBSearchResponse, MovieMetadata } from '~/types'

interface UpdateResponse {
  success: boolean
  movieId: string
}

const props = defineProps<{
  movie: MovieEntry
}>()

const emit = defineEmits<{
  updated: [newId: string]
}>()

const isLocalhost = ref(false)
const searchTitle = ref('')
const searchYear = ref('')
const imdbIdInput = ref('')
const isSearching = ref(false)
const searchResults = ref<OMDBSearchResult[]>([])
const googleResults = ref<OMDBSearchResult[]>([])
const searchError = ref('')
const sourceSearchTitles = reactive<Record<string, string>>({})

const initSourceSearchTitles = () => {
  props.movie.sources.forEach((source) => {
    const rawTitle = source.title || getPrimaryTitle(props.movie)
    sourceSearchTitles[source.id] = cleanTitleForSearch(rawTitle)
  })
}

// Collections state
const collectionsStore = useCollectionsStore()
const { collections } = storeToRefs(collectionsStore)
const { getCollectionsForMovie, loadCollections, addMovieToCollection, removeMovieFromCollection } = collectionsStore
const selectedCollectionId = ref('')
const isUpdatingCollection = ref(false)

const movieCollections = computed(() => getCollectionsForMovie(props.movie.imdbId))
const availableCollections = computed(() => {
  return Array.from(collections.value.values()).filter(
    c => !c.movieIds.includes(props.movie.imdbId)
  )
})

onMounted(() => {
  isLocalhost.value = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  searchTitle.value = getPrimaryTitle(props.movie)
  searchYear.value = props.movie.year?.toString() || ''
  initSourceSearchTitles()

  // Load collections if not already loaded
  if (collections.value.size === 0) {
    loadCollections()
  }
})

const addToCollection = async () => {
  if (!selectedCollectionId.value) return

  isUpdatingCollection.value = true
  try {
    const success = await addMovieToCollection(
      selectedCollectionId.value,
      props.movie.imdbId
    )
    if (success) {
      selectedCollectionId.value = ''
    }
  } finally {
    isUpdatingCollection.value = false
  }
}

const removeFromCollection = async (collectionId: string) => {
  if (!confirm('Remove movie from this collection?')) return

  isUpdatingCollection.value = true
  try {
    await removeMovieFromCollection(collectionId, props.movie.imdbId)
  } finally {
    isUpdatingCollection.value = false
  }
}

// Watch for movie changes to update search fields
watch(() => props.movie.imdbId, () => {
  searchTitle.value = getPrimaryTitle(props.movie)
  searchYear.value = props.movie.year?.toString() || ''
  imdbIdInput.value = ''
  searchResults.value = []
  searchError.value = ''
  initSourceSearchTitles()
})

const handleSearch = async () => {
  const title = searchTitle.value.trim()
  const year = searchYear.value.trim()

  if (!title) return

  isSearching.value = true
  searchError.value = ''
  searchResults.value = []

  try {

    const data = await $fetch<OMDBSearchResponse>('/api/admin/omdb/search', {
      query: {
        s: title,
        y: year
      }
    })

    if (data.Response === 'True') {
      searchResults.value = data.Search || []
    } else {
      searchError.value = data.Error || 'No results found'
    }
  } catch {
    searchError.value = 'Failed to search OMDB'
  } finally {
    isSearching.value = false
  }
}

const handleGoogleSearch = async (query: string) => {
  if (!query) return

  isSearching.value = true
  searchError.value = ''
  googleResults.value = []

  try {
    const data = await $fetch<OMDBSearchResponse>('/api/admin/google/search', {
      query: { q: `${query} site:imdb.com` }
    })

    if (data.Response === 'True') {
      googleResults.value = data.Search || []
      // Scroll to results
      nextTick(() => {
        const resultsEl = document.getElementById('google-results')
        resultsEl?.scrollIntoView({ behavior: 'smooth' })
      })
    } else {
      searchError.value = data.Error || 'No Google results found'
    }
  } catch {
    searchError.value = 'Failed to search Google'
  } finally {
    isSearching.value = false
  }
}

const searchByDescription = (source: MovieSource) => {
  if (!source.description) return
  // Use first 100 chars of description
  const cleanDesc = source.description.substring(0, 100).replace(/\n/g, ' ')
  handleGoogleSearch(cleanDesc)
}

const searchBoth = (source: MovieSource) => {
  const title = sourceSearchTitles[source.id] || ''
  const desc = source.description ? source.description.substring(0, 50).replace(/\n/g, ' ') : ''
  handleGoogleSearch(`${title} ${desc}`)
}

const removeSource = async (sourceId: string) => {
  if (!confirm('Are you sure you want to remove this source? If this is the last source, the movie entry will be deleted.')) return

  try {
    isSearching.value = true
    const res = await $fetch<{ success: boolean, movieId: string | null, deleted: boolean }>('/api/admin/movie/remove-source', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        sourceId
      }
    })

    if (res.success) {
      if (res.deleted) {
        // If movie was deleted, navigate back or emit event to parent
        // For now we emit updated with null or handle it in parent
        emit('updated', '')
      } else if (res.movieId) {
        emit('updated', res.movieId)
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to remove source:', err)
  } finally {
    isSearching.value = false
  }
}

const handleDirectImdbFetch = async () => {
  const input = imdbIdInput.value.trim()
  if (!input) return

  // Extract IMDB ID from input (could be full URL or just the ID)
  const match = input.match(/tt\d{7,}/)
  if (!match) {
    searchError.value = 'Invalid IMDB ID or URL (should contain tt followed by at least 7 digits)'
    return
  }

  const id = match[0]
  await selectMovie(id)
}

const selectMovie = async (imdbId: string) => {
  try {
    isSearching.value = true
    // Get full details first

    const details = await $fetch<MovieMetadata & { Response: string, Error?: string }>('/api/admin/omdb/details', {
      query: { i: imdbId }
    })

    if (details.Response === 'True') {

      const res = await $fetch<UpdateResponse>('/api/admin/movie/update', {
        method: 'POST',
        body: {
          movieId: props.movie.imdbId,
          metadata: details,
          verified: true
        }
      })

      if (res.success) {
        emit('updated', res.movieId)
      }
    } else {
      // eslint-disable-next-line no-console
      console.error('Failed to get movie details:', details.Error)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to update movie:', err)
  } finally {
    isSearching.value = false
  }
}

const removeMetadata = async () => {

  if (!confirm('Are you sure you want to remove metadata? This will reset the movie to an unmatched state.')) return

  try {
    isSearching.value = true

    const res = await $fetch<UpdateResponse>('/api/admin/movie/update', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        removeMetadata: true
      }
    })

    if (res.success) {
      emit('updated', res.movieId)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to remove metadata:', err)
  } finally {
    isSearching.value = false
  }
}

const verifyMovie = async () => {
  try {
    isSearching.value = true

    const res = await $fetch<UpdateResponse>('/api/admin/movie/update', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        verified: true
      }
    })

    if (res.success) {
      emit('updated', res.movieId)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to verify movie:', err)
  } finally {
    isSearching.value = false
  }
}
</script>
