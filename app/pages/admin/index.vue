<template>
  <div class="min-h-screen bg-theme-background text-theme-text p-4 md:p-8 transition-colors duration-300">
    <div
      v-if="!isDev"
      class="flex flex-col items-center justify-center h-[60vh] text-center"
    >
      <div class="i-mdi-lock text-64px text-gray-300 dark:text-gray-700 mb-4" />
      <h1 class="text-2xl font-bold mb-2">
        Access Denied
      </h1>
      <p class="text-theme-textmuted">
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
          <p class="text-theme-textmuted mt-1 flex items-center gap-2">
            Manage movie scraping and curation
            <span
              v-if="isConnected"
              class="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
              title="EventSource connected"
            >
              <div class="i-mdi-circle text-8px animate-pulse" />
              Live
            </span>
            <span
              v-else-if="isReconnecting"
              class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
              title="Reconnecting..."
            >
              <div class="i-mdi-circle text-8px animate-pulse" />
              Reconnecting
            </span>
            <span
              v-else
              class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
              title="EventSource disconnected"
            >
              <div class="i-mdi-circle text-8px" />
              Offline
            </span>
          </p>
        </div>
        <div class="flex flex-col items-end gap-3">
          <div class="flex items-center gap-3">
            <NuxtLink
              to="/"
              class="px-4 py-2 text-sm bg-theme-surface border border-theme-border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <div class="i-mdi-home" />
              View Site
            </NuxtLink>
            <button
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              :disabled="loading || generatingSqlite"
              @click="adminStore.generateSqlite"
            >
              <div
                class="i-mdi-database-export"
                :class="{ 'animate-spin': generatingSqlite }"
              />
              Generate SQLite
            </button>
            <button
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              :disabled="loading || refreshingStats"
              @click="adminStore.refreshStats"
            >
              <div
                class="i-mdi-refresh"
                :class="{ 'animate-spin': refreshingStats }"
              />
              Refresh Stats
            </button>
          </div>
          <!-- SQLite Generation Progress -->
          <div
            v-if="progress.sqlite && progress.sqlite.status === 'in_progress'"
            class="w-full max-w-md space-y-2"
          >
            <div class="flex items-center justify-between text-xs">
              <span class="text-theme-textmuted truncate mr-2">{{ progress.sqlite.message }}</span>
              <span class="font-mono text-nowrap">{{ progress.sqlite.current }} / {{ progress.sqlite.total }}</span>
            </div>
            <div class="h-2 bg-theme-border rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 transition-all duration-300"
                :style="{ width: `${(progress.sqlite.current / progress.sqlite.total) * 100}%` }"
              />
            </div>
          </div>
          <!-- Stats Refresh Progress -->
          <div
            v-if="progress.stats && progress.stats.status === 'in_progress'"
            class="w-full max-w-md space-y-2"
          >
            <div class="flex items-center justify-between text-xs">
              <span class="text-theme-textmuted truncate mr-2">{{ progress.stats.message }}</span>
              <span class="font-mono text-nowrap">{{ progress.stats.current }} / {{ progress.stats.total }}</span>
            </div>
            <div class="h-2 bg-theme-border rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-300"
                :style="{ width: `${(progress.stats.current / progress.stats.total) * 100}%` }"
              />
            </div>
          </div>
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
          :failed="stats.external.archiveOrg.failed"
          :failure-rate="stats.external.archiveOrg.failureRate"
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
          :failed="stats.external.youtube.totalFailed"
          :failure-rate="stats.external.youtube.failureRate"
          :failed-percent="youtubeFailedPercent"
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
          :failed="stats.omdb.failed"
          :failure-rate="stats.omdb.failureRate"
          :failed-percent="omdbFailedPercent"
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
          :failed="stats.posters.failed"
          :failure-rate="stats.posters.failureRate"
          :failed-percent="postersFailedPercent"
          icon="i-mdi-image-multiple"
          icon-color="text-purple-500"
          show-progress
          :percent="stats.posters.percentOfMoviesWithUrl"
          progress-color="bg-purple-500"
          :subtitle="`${stats.posters.downloaded} / ${stats.posters.withPosterUrl} posters`"
        />

        <AdminStatsCard
          title="AI Extracted"
          :value="stats.ai.withAiData"
          icon="i-mdi-robot"
          icon-color="text-purple-500"
          show-progress
          :percent="stats.ai.percent"
          progress-color="bg-purple-500"
          :subtitle="`${stats.ai.withAiData} / ${stats.ai.totalUnmatched} unmatched`"
        />

        <AdminStatsCard
          v-if="stats && stats.quality"
          title="Low Quality"
          :value="stats.quality.totalMarked"
          icon="i-mdi-quality-low"
          icon-color="text-orange-600"
          show-progress
          :percent="stats.quality.percent"
          progress-color="bg-orange-600"
          :subtitle="`${stats.quality.totalMarked} marked as low quality`"
        />
      </section>

      <!-- Quality Breakdown -->
      <section
        v-if="stats && stats.quality && stats.quality.totalMarked > 0"
        class="bg-theme-surface p-6 rounded-xl border border-theme-border shadow-sm"
      >
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2 text-theme-text">
          <div class="i-mdi-quality-low text-orange-600" />
          Quality Label Breakdown
        </h2>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div
            v-for="(count, label) in stats.quality.breakdown"
            :key="label"
            class="flex flex-col p-3 rounded-lg bg-theme-background border border-gray-100 dark:border-gray-700"
          >
            <span class="text-[10px] text-theme-textmuted uppercase font-bold truncate">{{ label }}</span>
            <span class="text-2xl font-black text-theme-text">{{ count }}</span>
          </div>
        </div>
      </section>

      <!-- YouTube Channel Stats -->
      <section>
      <AdminYouTubeChannelStats
        v-if="stats?.external.youtube.channels.length"
        :channels="stats.external.youtube.channels"
      />
      </section>

      <!-- Scrape Controls -->
      <div class="space-y-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Data Collection Section -->
        <section>
          <h2 class="text-2xl font-bold mb-4 flex items-center gap-2">
            <div class="i-mdi-database-import text-amber-600" />
            Data Collection
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <AdminArchiveScraper
              v-model="archiveOptions"
              :loading="scraping"
              @start="adminStore.startArchiveScrape"
            />

            <AdminYouTubeScraper
              v-model="youtubeOptions"
              :channels="youtubeChannels"
              :loading="scraping"
              @start="adminStore.startYouTubeScrape"
            />
          </div>
        </section>



        <!-- Data Enrichment Section -->
        <section >
          <h2 class="text-2xl font-bold mb-4 flex items-center gap-2">
            <div class="i-mdi-database-sync text-green-600" />
            Data Enrichment
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <AdminOMDBEnrichment
              v-model="omdbOptions"
              :loading="scraping"
              @start="adminStore.startOMDBEnrichment"
            />

            <AdminAIExtractor
              v-model="aiOptions"
              :loading="scraping"
              @start="adminStore.startAIExtraction"
            />

            <AdminPosterDownloader
              v-model="posterOptions"
              :loading="scraping"
              @start="adminStore.startPosterDownload"
            />

            <AdminPosterArchiver />
	          <!-- Data Cleanup Section -->
	          <div>
	            <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
	              <div class="i-mdi-broom text-orange-600" />
	              Data Cleanup
	            </h3>
	            <div class="space-y-4">
	              <AdminDataDeduplication
	                :loading="deduplicating"
	                :results="deduplicationResults"
	                @start="adminStore.deduplicateDescriptions"
	              />
	              <AdminCollectionCleanup
	                :loading="cleaningCollections"
	                :results="collectionCleanupResults"
	                @start="adminStore.cleanupCollections"
	              />
	            </div>
	          </div>
          </div>

        </section>
        <!-- Collection Management Section -->
        <section>
          <AdminCollectionManager />
        </section>
      </div>

      <!-- Results Log -->
      <AdminResultsLog
        v-if="results || posterResults"
        :results="results"
        :poster-results="posterResults"
        @clear="clearResults"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ScrapeStats } from '~/types/admin'

// Set page title
useHead({
  title: 'Admin Dashboard - Movies Deluxe',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
  ],
})

const isDev = ref(false)
const adminStore = useAdminStore()
const { connect: connectProgress, isConnected, isReconnecting } = useProgress()

// Extract reactive state from store
const {
  loading,
  generatingSqlite,
  stats,
  archiveOptions,
  scraping,
  youtubeOptions,
  youtubeChannels,
  omdbOptions,
  aiOptions,
  posterOptions,
  deduplicating,
  deduplicationResults,
  cleaningCollections,
  collectionCleanupResults,
  results,
  posterResults,
  progress,
  databasePercentOfTotal,
  totalExternalVideos,
  youtubeTotalScraped,
  youtubeFailedPercent,
  youtubePercent,
  youtubeTotalAvailable,
  omdbFailedPercent,
  postersFailedPercent
} = storeToRefs(adminStore)

// Computed property to check if stats are being refreshed
const refreshingStats = computed(() => {
  return progress.value.stats?.status === 'in_progress' || loading.value
})

// Clear results
const clearResults = () => {
  adminStore.results = null
  adminStore.posterResults = null
  adminStore.deduplicationResults = null
  adminStore.collectionCleanupResults = null
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
