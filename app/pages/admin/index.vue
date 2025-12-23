<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 md:p-8">
    <div
      v-if="!isDev"
      class="flex flex-col items-center justify-center h-[60vh] text-center"
    >
      <div class="i-mdi-lock text-64px text-gray-300 dark:text-gray-700 mb-4" />
      <h1 class="text-2xl font-bold mb-2">
        Access Denied
      </h1>
      <p class="text-gray-500">
        The admin interface is only available on localhost.
      </p>
      <NuxtLink
        to="/"
        class="mt-6 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
      >
        Back to Home
      </NuxtLink>
    </div>

    <div
      v-else
      class="max-w-7xl mx-auto space-y-8"
    >
      <!-- Header -->
      <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold flex items-center gap-3">
            <div class="i-mdi-shield-crown text-blue-600" />
            Admin Dashboard
          </h1>
          <p class="text-gray-500 mt-1">
            Manage movie scraping and curation
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            title="Toggle dark mode"
            @click="toggleDark()"
          >
            <div
              v-if="isDark"
              class="i-material-symbols-light-wb-sunny text-xl text-yellow-500"
            />
            <div
              v-else
              class="i-material-symbols-light-dark-mode text-xl"
            />
          </button>
          <NuxtLink
            to="/"
            class="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <div class="i-mdi-home" />
            View Site
          </NuxtLink>
          <button
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            :disabled="loading"
            @click="refreshStats"
          >
            <div :class="['i-mdi-refresh', loading ? 'animate-spin' : '']" />
            Refresh Stats
          </button>
        </div>
      </header>

      <!-- Stats Overview -->
      <section
        v-if="stats"
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        <div class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Movies</span>
            <div class="i-mdi-movie-open text-xl text-blue-500" />
          </div>
          <div class="text-2xl font-bold">
            {{ stats.database.total }}
          </div>
          <div class="mt-1 text-xs text-gray-400">
            {{ stats.database.matched }} matched
          </div>
        </div>

        <div class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">Archive.org</span>
            <div class="i-mdi-archive text-xl text-amber-500" />
          </div>
          <div class="text-2xl font-bold">
            {{ stats.external.archiveOrg.scraped }}
          </div>
          <div class="mt-1 flex items-center gap-2">
            <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-amber-500 transition-all duration-1000"
                :style="{ width: `${stats.external.archiveOrg.percent}%` }"
              />
            </div>
            <span class="text-xs font-medium">{{ stats.external.archiveOrg.percent.toFixed(0) }}%</span>
          </div>
        </div>

        <div class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">YouTube</span>
            <div class="i-mdi-youtube text-xl text-red-500" />
          </div>
          <div class="text-2xl font-bold">
            {{ stats.database.youtubeSources }}
          </div>
          <div class="mt-1 text-xs text-gray-400">
            sources
          </div>
        </div>

        <div class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">OMDB</span>
            <div class="i-mdi-check-decagram text-xl text-green-500" />
          </div>
          <div class="text-2xl font-bold">
            {{ stats.omdb.matched }}
          </div>
          <div class="mt-1 flex items-center gap-2">
            <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-1000"
                :style="{ width: `${stats.omdb.percent}%` }"
              />
            </div>
            <span class="text-xs font-medium">{{ stats.omdb.percent.toFixed(0) }}%</span>
          </div>
        </div>

        <div class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">Posters</span>
            <div class="i-mdi-image-multiple text-xl text-purple-500" />
          </div>
          <div class="text-2xl font-bold">
            {{ stats.posters.downloaded }}
          </div>
          <div class="mt-1 flex items-center gap-2">
            <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 transition-all duration-1000"
                :style="{ width: `${stats.posters.percent}%` }"
              />
            </div>
            <span class="text-xs font-medium">{{ stats.posters.percent.toFixed(0) }}%</span>
          </div>
        </div>
      </section>

      <!-- Scrape Controls -->
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
        <!-- Archive.org Scraper -->
        <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-archive text-amber-500" />
            Archive.org Scraper
          </h2>

          <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Rows per page</label>
                <input
                  v-model="archiveOptions.rows"
                  type="number"
                  class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Pages to fetch</label>
                <input
                  v-model="archiveOptions.pages"
                  type="number"
                  class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="archiveOptions.autoDetect"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Auto-detect starting page</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="archiveOptions.skipOmdb"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Skip OMDB matching (faster)</span>
              </label>
            </div>

            <button
              class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="scraping"
              @click="startArchiveScrape"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-play"
              />
              {{ scraping ? 'Scraping in progress...' : 'Start Archive.org Scrape' }}
            </button>
          </div>
        </div>

        <!-- YouTube Scraper -->
        <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-youtube text-red-500" />
            YouTube Scraper
          </h2>

          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Videos per channel</label>
              <input
                v-model="youtubeOptions.limit"
                type="number"
                class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="youtubeOptions.skipOmdb"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Skip OMDB matching (faster)</span>
              </label>
            </div>

            <button
              class="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="scraping"
              @click="startYouTubeScrape"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-play"
              />
              {{ scraping ? 'Scraping in progress...' : 'Start YouTube Scrape' }}
            </button>
          </div>
        </div>

        <!-- Poster Downloader -->
        <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-image-multiple text-purple-500" />
            Poster Downloader
          </h2>

          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Download limit</label>
              <input
                v-model="posterOptions.limit"
                type="number"
                class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="posterOptions.force"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Force re-download</span>
              </label>
            </div>

            <button
              class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="scraping"
              @click="startPosterDownload"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-download"
              />
              {{ scraping ? 'Downloading...' : 'Download Posters' }}
            </button>
          </div>
        </div>

        <!-- OMDB Enrichment -->
        <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-database-sync text-blue-600" />
            OMDB Enrichment
          </h2>

          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Enrichment limit</label>
              <input
                v-model="omdbOptions.limit"
                type="number"
                class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="omdbOptions.onlyUnmatched"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Only unmatched movies</span>
              </label>
            </div>

            <button
              class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="scraping"
              @click="startOMDBEnrichment"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-database-sync"
              />
              {{ scraping ? 'Enriching...' : 'Enrich with OMDB' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Results Log -->
      <section
        v-if="results || posterResults"
        class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold">
            {{ posterResults ? 'Poster Download Results' : 'Scrape Results' }}
          </h2>
          <button
            class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            @click="results = null; posterResults = null"
          >
            Clear
          </button>
        </div>

        <div
          v-if="results"
          class="grid grid-cols-3 gap-4 mb-6"
        >
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
            <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1">
              Processed
            </div>
            <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {{ results.processed }}
            </div>
          </div>
          <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100 dark:border-green-800">
            <div class="text-xs text-green-600 dark:text-green-400 uppercase font-bold tracking-wider mb-1">
              Added
            </div>
            <div class="text-2xl font-bold text-green-700 dark:text-green-300">
              {{ results.added }}
            </div>
          </div>
          <div class="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800">
            <div class="text-xs text-purple-600 dark:text-purple-400 uppercase font-bold tracking-wider mb-1">
              Updated
            </div>
            <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {{ results.updated }}
            </div>
          </div>
        </div>

        <div
          v-if="posterResults"
          class="grid grid-cols-2 gap-4 mb-6"
        >
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
            <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1">
              Successful
            </div>
            <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {{ posterResults.successful }}
            </div>
          </div>
          <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-800">
            <div class="text-xs text-red-600 dark:text-red-400 uppercase font-bold tracking-wider mb-1">
              Failed
            </div>
            <div class="text-2xl font-bold text-red-700 dark:text-red-300">
              {{ posterResults.failed }}
            </div>
          </div>
        </div>

        <div
          v-if="(results?.errors.length || 0) > 0 || (posterResults?.errors.length || 0) > 0"
          class="space-y-2"
        >
          <h3 class="text-sm font-bold text-red-500 uppercase tracking-wider">
            Errors ({{ (results?.errors.length || 0) + (posterResults?.errors.length || 0) }})
          </h3>
          <div class="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-900/10 p-4 rounded-xl text-xs font-mono text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
            <div
              v-for="(err, i) in (results?.errors || posterResults?.errors || [])"
              :key="i"
              class="mb-1"
            >
              • {{ err }}
            </div>
          </div>
        </div>

        <div
          v-if="results?.debug && results.debug.length > 0"
          class="space-y-2"
        >
          <h3 class="text-sm font-bold text-blue-500 uppercase tracking-wider">
            Debug Log ({{ results.debug.length }})
            /* eslint-disable no-console */
          </h3>
          <div class="max-h-60 overflow-y-auto bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl text-xs font-mono text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
            <div
              v-for="(msg, i) in results.debug"
              :key="i"
              class="mb-1"
            >
              {{ msg }}
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-undef */
import { isLocalhost } from '@/utils/isLocalhost'

interface ScrapeStats {
  database: {
    total: number
    matched: number
    unmatched: number
    archiveOrgSources: number
    youtubeSources: number
    curatedCount: number
  }
  external: {
    archiveOrg: {
      total: number
      scraped: number
      percent: number
    }
  }
  curation: {
    total: number
    curated: number
    percent: number
  }
  omdb: {
    total: number
    matched: number
    unmatched: number
    percent: number
  }
  posters: {
    totalMovies: number
    withPosterUrl: number
    downloaded: number
    missing: number
    percent: number
  }
}

interface ScrapeResults {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug?: string[]
}

interface PosterResults {
  processed: number
  successful: number
  failed: number
  errors: string[]
}

const isDev = ref(false)
const loading = ref(false)
const scraping = ref(false)
const stats = ref<ScrapeStats | null>(null)
const results = ref<ScrapeResults | null>(null)
const posterResults = ref<PosterResults | null>(null)

// Dark mode toggle
const isDark = useDark()
const toggleDark = useToggle(isDark)

const archiveOptions = reactive({
  rows: 10,
  pages: 1,
  skipOmdb: true,
  autoDetect: true,
  collections: ['feature_films'],
})

const youtubeOptions = reactive({
  limit: 10,
  skipOmdb: true,
})

const posterOptions = reactive({
  limit: 50,
  force: false,
})

const omdbOptions = reactive({
  limit: 50,
  onlyUnmatched: true,
})

onMounted(async () => {
  isDev.value = isLocalhost()
  if (isDev.value) {
    await refreshStats()
  }
})

const refreshStats = async () => {
  loading.value = true
  try {
    stats.value = await $fetch<ScrapeStats>('/api/admin/scrape/stats')
  } catch (e) {
    console.error('Failed to fetch stats', e)
  } finally {
    loading.value = false
  }
}

const startArchiveScrape = async () => {
  scraping.value = true
  results.value = null
  try {
    results.value = await $fetch('/api/admin/scrape/archive', {
      method: 'POST',
      body: archiveOptions
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('Archive scrape failed', e)
    results.value = {
      processed: 0,
      added: 0,
      updated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}

const startYouTubeScrape = async () => {
  scraping.value = true
  results.value = null
  try {
    results.value = await $fetch('/api/admin/scrape/youtube', {
      method: 'POST',
      body: youtubeOptions
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('YouTube scrape failed', e)
    results.value = {
      processed: 0,
      added: 0,
      updated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}

const startPosterDownload = async () => {
  scraping.value = true
  posterResults.value = null
  try {
    posterResults.value = await $fetch('/api/admin/posters/download', {
      method: 'POST',
      body: posterOptions,
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('Poster download failed', e)
    posterResults.value = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}

const startOMDBEnrichment = async () => {
  scraping.value = true
  results.value = null
  try {
    results.value = await $fetch('/api/admin/omdb/enrich', {
      method: 'POST',
      body: omdbOptions,
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('OMDB enrichment failed', e)
    results.value = {
      processed: 0,
      added: 0,
      updated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}
</script>
