<template>
  <div
    v-if="isLocalhost"
    class="mt-8 p-6 bg-yellow-50 dark:bg-gray-800 border-2 border-yellow-200 dark:border-gray-700 rounded-xl"
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
            :key="source.url"
            class="bg-white dark:bg-gray-800/50 p-3 rounded border border-yellow-100 dark:border-gray-700 mb-2"
          >
            <div class="flex items-center gap-2 mb-1">
              <div
                :class="source.type === 'youtube' ? 'i-mdi-youtube text-red-600' : 'i-mdi-bank text-blue-600'"
                class="text-lg"
              />
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ source.type }}</span>
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-undef */
import type { MovieEntry, OMDBSearchResult, OMDBSearchResponse, MovieMetadata } from '~/types'

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
  imdbIdInput.value = ''
  searchResults.value = []
  searchError.value = ''
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
