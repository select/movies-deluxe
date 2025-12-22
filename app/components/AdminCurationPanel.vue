<template>
  <div
    v-if="isLocalhost"
    class="mt-8 p-6 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl"
  >
    <div class="flex items-center gap-2 mb-4 text-yellow-800 dark:text-yellow-200">
      <div class="i-mdi-shield-edit text-2xl" />
      <h2 class="text-xl font-bold">
        Admin Curation
      </h2>
      <span class="ml-auto text-xs font-mono bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded">
        localhost only
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left: Current Info & Search -->
      <div class="space-y-6">
        <div>
          <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-yellow-400 mb-2">
            Source Info
          </h3>
          <div
            v-for="source in movie.sources"
            :key="source.url"
            class="bg-white dark:bg-gray-800 p-3 rounded border border-yellow-100 dark:border-yellow-900 mb-2"
          >
            <div class="flex items-center gap-2 mb-1">
              <div
                :class="source.type === 'youtube' ? 'i-mdi-youtube text-red-600' : 'i-mdi-bank text-blue-600'"
                class="text-lg"
              />
              <span class="font-medium">{{ source.type }}</span>
            </div>
            <p
              v-if="source.description"
              class="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-wrap"
            >
              {{ source.description }}
            </p>
            <p
              v-else
              class="text-xs italic text-gray-400"
            >
              No description available in database
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-yellow-400">
            Search OMDB
          </h3>
          <div class="flex gap-2">
            <input
              v-model="searchTitle"
              type="text"
              placeholder="Movie Title"
              class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              @keyup.enter="handleSearch"
            >
            <input
              v-model="searchYear"
              type="text"
              placeholder="Year"
              class="w-20 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
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

          <div
            v-if="searchError"
            class="text-red-500 text-sm"
          >
            {{ searchError }}
          </div>
        </div>

        <div class="pt-4 border-t border-yellow-200 dark:border-yellow-800">
          <button
            class="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors text-sm font-bold"
            @click="removeMetadata"
          >
            <div class="i-mdi-delete-sweep text-lg" />
            Remove All Metadata
          </button>
        </div>
      </div>

      <!-- Right: Search Results -->
      <div>
        <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-yellow-400 mb-2">
          Search Results
        </h3>
        <div
          v-if="searchResults.length > 0"
          class="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin"
        >
          <div
            v-for="result in searchResults"
            :key="result.imdbID"
            class="flex gap-3 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 hover:border-yellow-400 dark:hover:border-yellow-600 transition-colors group"
          >
            <img
              :src="result.Poster !== 'N/A' ? result.Poster : '/favicon.ico'"
              class="w-12 h-18 object-cover rounded"
              alt="Poster"
            >
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-sm truncate">
                {{ result.Title }}
              </h4>
              <p class="text-xs text-gray-500">
                {{ result.Year }} • {{ result.Type }}
              </p>
              <p class="text-[10px] font-mono text-gray-400">
                {{ result.imdbID }}
              </p>
            </div>
            <button
              class="self-center px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity"
              @click="selectMovie(result.imdbID)"
            >
              Select
            </button>
          </div>
        </div>
        <div
          v-else-if="!isSearching"
          class="h-[200px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg"
        >
          <div class="i-mdi-magnify text-4xl mb-2" />
          <p class="text-sm">
            Search results will appear here
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MovieEntry, OMDBSearchResult } from '~/types'

const props = defineProps<{
  movie: MovieEntry
}>()

const emit = defineEmits<{
  updated: [newId: string]
}>()

const isLocalhost = ref(false)
const searchTitle = ref('')
const searchYear = ref('')
const isSearching = ref(false)
const searchResults = ref<OMDBSearchResult[]>([])
const searchError = ref('')

onMounted(() => {
  isLocalhost.value = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  searchTitle.value = props.movie.title
  searchYear.value = props.movie.year?.toString() || ''
})

// Watch for movie changes to update search fields
watch(() => props.movie.imdbId, () => {
  searchTitle.value = props.movie.title
  searchYear.value = props.movie.year?.toString() || ''
  searchResults.value = []
  searchError.value = ''
})

const handleSearch = async () => {
  if (!searchTitle.value) return
  
  isSearching.value = true
  searchError.value = ''
  searchResults.value = []
  
  try {
    // eslint-disable-next-line no-undef
    const data = await $fetch('/api/admin/omdb/search', {
      query: {
        s: searchTitle.value,
        y: searchYear.value
      }
    })
    
    if (data.Response === 'True') {
      searchResults.value = data.Search
    } else {
      searchError.value = data.Error || 'No results found'
    }
  } catch {
    searchError.value = 'Failed to search OMDB'
  } finally {
    isSearching.value = false
  }
}

const selectMovie = async (imdbId: string) => {
  try {
    isSearching.value = true
    // Get full details first
    // eslint-disable-next-line no-undef
    const details = await $fetch('/api/admin/omdb/details', {
      query: { i: imdbId }
    })
    
    if (details.Response === 'True') {
      // eslint-disable-next-line no-undef
      const res = await $fetch('/api/admin/movie/update', {
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
      // eslint-disable-next-line no-undef
      alert('Failed to get movie details: ' + details.Error)
    }
  } catch {
    // eslint-disable-next-line no-undef
    alert('Failed to update movie')
  } finally {
    isSearching.value = false
  }
}

const removeMetadata = async () => {
  // eslint-disable-next-line no-undef
  if (!confirm('Are you sure you want to remove metadata? This will reset the movie to an unmatched state.')) return
  
  try {
    isSearching.value = true
    // eslint-disable-next-line no-undef
    const res = await $fetch('/api/admin/movie/update', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        removeMetadata: true
      }
    })
    
    if (res.success) {
      emit('updated', res.movieId)
    }
  } catch {
    // eslint-disable-next-line no-undef
    alert('Failed to remove metadata')
  } finally {
    isSearching.value = false
  }
}
</script>
