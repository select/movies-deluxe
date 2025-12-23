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
            :disabled="loading || generatingSqlite"
            @click="generateSqlite"
          >
            <div :class="['i-mdi-database-export', generatingSqlite ? 'animate-spin' : '']" />
            Generate SQLite
          </button>
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
        <AdminStatsCard
          title="Total Movies"
          :value="stats.database.total"
          icon="i-mdi-movie-open"
          icon-color="text-blue-500"
          show-progress
          :percent="databasePercentOfTotal"
          progress-color="bg-blue-500"
          :percent-precision="1"
          :subtitle="`of ${totalExternalVideos.toLocaleString()} available`"
        />

        <AdminStatsCard
          title="Archive.org"
          :value="stats.external.archiveOrg.scraped"
          icon="i-mdi-archive"
          icon-color="text-amber-500"
          show-progress
          :percent="stats.external.archiveOrg.percent"
          progress-color="bg-amber-500"
          :subtitle="`${stats.external.archiveOrg.scraped} / ${stats.external.archiveOrg.total || '?'} videos`"
        />

        <AdminStatsCard
          title="YouTube"
          :value="youtubeTotalScraped"
          icon="i-mdi-youtube"
          icon-color="text-red-500"
          show-progress
          :percent="youtubePercent"
          progress-color="bg-red-500"
          :subtitle="`${youtubeTotalScraped} / ${youtubeTotalAvailable || '?'} videos`"
        />

        <AdminStatsCard
          title="OMDB"
          :value="stats.omdb.matched"
          icon="i-mdi-database-sync"
          icon-color="text-green-500"
          show-progress
          :percent="stats.omdb.percent"
          progress-color="bg-green-500"
          :subtitle="`${stats.omdb.matched} / ${stats.omdb.total} movies`"
        />

        <AdminStatsCard
          title="Posters"
          :value="stats.posters.downloaded"
          icon="i-mdi-image-multiple"
          icon-color="text-purple-500"
          show-progress
          :percent="stats.posters.percent"
          progress-color="bg-purple-500"
          :subtitle="`${stats.posters.downloaded} / ${stats.posters.withPosterUrl} posters`"
        />
      </section>

      <!-- YouTube Channel Stats -->
      <AdminYouTubeChannelStats
        v-if="stats?.external.youtube.channels.length"
        :channels="stats.external.youtube.channels"
      />

      <!-- SQLite Progress -->
      <div
        v-if="adminStore.progress.sqlite && adminStore.progress.sqlite.status === 'in_progress'"
        class="p-6 rounded-3xl shadow-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold flex items-center gap-2">
            <div class="i-mdi-database-export text-blue-600" />
            Generating SQLite Database
          </h2>
          <span class="text-sm font-mono">{{ adminStore.progress.sqlite.current }} / {{ adminStore.progress.sqlite.total }}</span>
        </div>
        <div class="space-y-2">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-600 transition-all duration-300"
              :style="{ width: `${(adminStore.progress.sqlite.current / adminStore.progress.sqlite.total) * 100}%` }"
            />
          </div>
          <p class="text-sm text-blue-700 dark:text-blue-300 italic">
            {{ adminStore.progress.sqlite.message }}
          </p>
        </div>
      </div>

      <!-- Scrape Controls -->
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
        <AdminArchiveScraper
          v-model="archiveOptions"
          :loading="scraping"
          @start="startArchiveScrape"
        />

        <AdminYouTubeScraper
          v-model="youtubeOptions"
          :channels="youtubeChannels"
          :loading="scraping"
          @start="startYouTubeScrape"
        />

        <AdminPosterDownloader
          v-model="posterOptions"
          :loading="scraping"
          @start="startPosterDownload"
        />

        <AdminOMDBEnrichment
          v-model="omdbOptions"
          :loading="scraping"
          @start="startOMDBEnrichment"
        />
      </div>

      <!-- Results Log -->
      <AdminResultsLog
        v-if="results || posterResults"
        :results="results"
        :poster-results="posterResults"
        @clear="results = null; posterResults = null"
      />
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
    youtube: {
      channels: Array<{
        id: string
        name: string
        enabled: boolean
        scraped: number
        total: number
      }>
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
  lastUpdated?: string
}

interface ScrapeResults {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug?: string[]
  channels?: Array<{ id: string; processed: number; added: number; updated: number }>
}

interface YouTubeChannelConfig {
  id: string
  name: string
  enabled: boolean
  language?: string
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
const generatingSqlite = ref(false)
const stats = ref<ScrapeStats | null>(null)
const results = ref<ScrapeResults | null>(null)
const posterResults = ref<PosterResults | null>(null)
const youtubeChannels = ref<YouTubeChannelConfig[]>([])

const adminStore = useAdminStore()
const { connect: connectProgress } = useProgress()

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
  allPages: false,
  channels: [] as string[],
})

const posterOptions = reactive({
  limit: 50,
  force: false,
})

const omdbOptions = reactive({
  limit: 50,
  onlyUnmatched: true,
  forceRetryFailed: false,
})

onMounted(async () => {
  isDev.value = isLocalhost()
  if (isDev.value) {
    connectProgress()

    // Try to load initial stats from static file
    try {
      const initialStats = await $fetch<ScrapeStats>('/data/stats.json')
      if (initialStats) {
        stats.value = initialStats
      }
    } catch {
      // Fallback to API if file doesn't exist yet
      await refreshStats()
    }
    await loadYouTubeChannels()
  }
})

const loadYouTubeChannels = async () => {
  try {
    const data = await $fetch<{ channels: YouTubeChannelConfig[] }>('/api/admin/scrape/youtube-channels')
    youtubeChannels.value = data.channels
  } catch (e) {
    console.error('Failed to load YouTube channels', e)
  }
}

// Computed properties
const totalExternalVideos = computed(() => {
  if (!stats.value) return 0
  const archiveTotal = stats.value.external.archiveOrg.total || 0
  const youtubeTotal = stats.value.external.youtube.channels.reduce((sum, c) => sum + (c.total || 0), 0)
  return archiveTotal + youtubeTotal
})

const youtubeTotalScraped = computed(() => {
  if (!stats.value) return 0
  return stats.value.external.youtube.channels.reduce((sum, c) => sum + (c.scraped || 0), 0)
})

const youtubeTotalAvailable = computed(() => {
  if (!stats.value) return 0
  return stats.value.external.youtube.channels.reduce((sum, c) => sum + (c.total || 0), 0)
})

const youtubePercent = computed(() => {
  if (youtubeTotalAvailable.value === 0) return 0
  return (youtubeTotalScraped.value / youtubeTotalAvailable.value) * 100
})

const databasePercentOfTotal = computed(() => {
  if (!stats.value || totalExternalVideos.value === 0) return 0
  return (stats.value.database.total / totalExternalVideos.value) * 100
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
    results.value = await ($fetch as any)('/api/admin/scrape/archive', {
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
    results.value = await ($fetch as any)('/api/admin/scrape/youtube', {
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
    posterResults.value = await ($fetch as any)('/api/admin/posters/download', {
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
    results.value = await ($fetch as any)('/api/admin/omdb/enrich', {
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

const generateSqlite = async () => {
  generatingSqlite.value = true
  try {
    await $fetch('/api/admin/sqlite/generate', {
      method: 'POST'
    })
  } catch (e) {
    console.error('SQLite generation failed', e)
  } finally {
    generatingSqlite.value = false
  }
}
</script>
