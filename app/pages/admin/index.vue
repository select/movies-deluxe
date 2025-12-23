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
            :disabled="adminStore.loading || adminStore.generatingSqlite"
            @click="adminStore.generateSqlite"
          >
            <div
              :class="['i-mdi-database-export', adminStore.generatingSqlite ? 'animate-spin' : '']"
            />
            Generate SQLite
          </button>
          <button
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            :disabled="adminStore.loading"
            @click="adminStore.refreshStats"
          >
            <div :class="['i-mdi-refresh', adminStore.loading ? 'animate-spin' : '']" />
            Refresh Stats
          </button>
        </div>
      </header>

      <!-- Stats Overview -->
      <section
        v-if="adminStore.stats"
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        <AdminStatsCard
          title="Total Movies"
          :value="adminStore.stats.database.total"
          icon="i-mdi-movie-open"
          icon-color="text-blue-500"
          show-progress
          :percent="adminStore.databasePercentOfTotal"
          progress-color="bg-blue-500"
          :percent-precision="1"
          :subtitle="`of ${adminStore.totalExternalVideos.toLocaleString()} available`"
        />

        <AdminStatsCard
          title="Archive.org"
          :value="adminStore.stats.external.archiveOrg.scraped"
          icon="i-mdi-archive"
          icon-color="text-amber-500"
          show-progress
          :percent="adminStore.stats.external.archiveOrg.percent"
          progress-color="bg-amber-500"
          :subtitle="`${adminStore.stats.external.archiveOrg.scraped} / ${adminStore.stats.external.archiveOrg.total || '?'} videos`"
        />

        <AdminStatsCard
          title="YouTube"
          :value="adminStore.youtubeTotalScraped"
          icon="i-mdi-youtube"
          icon-color="text-red-500"
          show-progress
          :percent="adminStore.youtubePercent"
          progress-color="bg-red-500"
          :subtitle="`${adminStore.youtubeTotalScraped} / ${adminStore.youtubeTotalAvailable || '?'} videos`"
        />

        <AdminStatsCard
          title="OMDB"
          :value="adminStore.stats.omdb.matched"
          icon="i-mdi-database-sync"
          icon-color="text-green-500"
          show-progress
          :percent="adminStore.stats.omdb.percent"
          progress-color="bg-green-500"
          :subtitle="`${adminStore.stats.omdb.matched} / ${adminStore.stats.omdb.total} movies`"
        />

        <AdminStatsCard
          title="Posters"
          :value="adminStore.stats.posters.downloaded"
          icon="i-mdi-image-multiple"
          icon-color="text-purple-500"
          show-progress
          :percent="adminStore.stats.posters.percent"
          progress-color="bg-purple-500"
          :subtitle="`${adminStore.stats.posters.downloaded} / ${adminStore.stats.posters.withPosterUrl} posters`"
        />
      </section>

      <!-- YouTube Channel Stats -->
      <AdminYouTubeChannelStats
        v-if="adminStore.stats?.external.youtube.channels.length"
        :channels="adminStore.stats.external.youtube.channels"
      />

      <!-- Workflow Guide -->
      <section class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h2 class="text-xl font-bold mb-3 flex items-center gap-2">
          <div class="i-mdi-information text-blue-600" />
          Admin Workflow
        </h2>
        <div class="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <h3 class="font-semibold mb-2 flex items-center gap-2">
              <div class="i-mdi-numeric-1-circle text-amber-600" />
              Data Collection
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Scrape Archive.org and YouTube to collect raw movie data (titles, years, URLs, thumbnails). No OMDB enrichment happens during scraping.
            </p>
          </div>
          <div>
            <h3 class="font-semibold mb-2 flex items-center gap-2">
              <div class="i-mdi-numeric-2-circle text-green-600" />
              Data Enrichment
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Run OMDB enrichment separately to add metadata (plot, director, actors, ratings). Uses multiple cleaning strategies for better matching.
            </p>
          </div>
          <div>
            <h3 class="font-semibold mb-2 flex items-center gap-2">
              <div class="i-mdi-numeric-3-circle text-purple-600" />
              Poster Download
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              After OMDB enrichment, download poster images locally. Posters are stored in public/posters/ for offline use.
            </p>
          </div>
        </div>
      </section>

      <!-- Scrape Controls -->
      <div class="space-y-6">
        <!-- Data Collection Section -->
        <section>
          <h2 class="text-2xl font-bold mb-4 flex items-center gap-2">
            <div class="i-mdi-database-import text-amber-600" />
            Data Collection
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <AdminArchiveScraper
              v-model="adminStore.archiveOptions"
              :loading="adminStore.scraping"
              @start="adminStore.startArchiveScrape"
            />

            <AdminYouTubeScraper
              v-model="adminStore.youtubeOptions"
              :channels="adminStore.youtubeChannels"
              :loading="adminStore.scraping"
              @start="adminStore.startYouTubeScrape"
            />
          </div>
        </section>

        <!-- Data Enrichment Section -->
        <section>
          <h2 class="text-2xl font-bold mb-4 flex items-center gap-2">
            <div class="i-mdi-database-sync text-green-600" />
            Data Enrichment
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <AdminOMDBEnrichment
              v-model="adminStore.omdbOptions"
              :loading="adminStore.scraping"
              @start="adminStore.startOMDBEnrichment"
            />

            <AdminPosterDownloader
              v-model="adminStore.posterOptions"
              :loading="adminStore.scraping"
              @start="adminStore.startPosterDownload"
            />
          </div>
        </section>
      </div>

      <!-- Results Log -->
      <AdminResultsLog
        v-if="adminStore.results || adminStore.posterResults"
        :results="adminStore.results"
        :poster-results="adminStore.posterResults"
        @clear="clearResults"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
 
import type { ScrapeStats } from '~/types/admin'

const isDev = ref(false)
const adminStore = useAdminStore()
const { connect: connectProgress } = useProgress()

// Dark mode toggle
const isDark = useDark()
const toggleDark = useToggle(isDark)

// Clear results
const clearResults = () => {
  adminStore.results = null
  adminStore.posterResults = null
}

onMounted(async () => {
  isDev.value = isLocalhost()
  if (isDev.value) {
    connectProgress()

    // Try to load initial stats from static file
    try {
      const initialStats = await $fetch<ScrapeStats>('/data/stats.json')
      if (initialStats) {
        adminStore.stats = initialStats
      }
    } catch {
      // Fallback to API if file doesn't exist yet
      await adminStore.refreshStats()
    }
    await adminStore.loadYouTubeChannels()
  }
})
</script>
