import type {
  ScrapeStats,
  ScrapeResults,
  YouTubeChannelConfig,
  PosterResults,
  ArchiveOptions,
  YouTubeOptions,
  PosterOptions,
  OMDBOptions,
  DeduplicationResult,
} from '~/types/admin'

export interface ProgressUpdate {
  type: 'archive' | 'youtube' | 'omdb' | 'posters' | 'sqlite' | 'ai'
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  current: number
  total: number
  message: string
  successCurrent?: number
  successPrevious?: number
  failedCurrent?: number
  failedPrevious?: number
}

export const useAdminStore = defineStore('admin', () => {
  const loading = ref(false)
  const scraping = ref(false)
  const generatingSqlite = ref(false)
  const deduplicating = ref(false)
  const stats = ref<ScrapeStats | null>(null)
  const results = ref<ScrapeResults | null>(null)
  const posterResults = ref<PosterResults | null>(null)
  const deduplicationResults = ref<DeduplicationResult | null>(null)
  const youtubeChannels = ref<YouTubeChannelConfig[]>([])
  const progress = ref<Record<string, ProgressUpdate>>({})

  const archiveOptions = reactive<ArchiveOptions>({
    collections: ['feature_films'],
  })

  const youtubeOptions = reactive<YouTubeOptions>({
    limit: 10,
    allPages: false,
    channels: [],
  })

  const posterOptions = reactive<PosterOptions>({
    limit: 50,
    force: false,
  })

  const omdbOptions = reactive<OMDBOptions>({
    limit: 50,
    onlyUnmatched: true,
    forceRetryFailed: false,
  })

  const aiOptions = reactive({
    limit: 100,
    onlyUnmatched: true,
    forceReExtract: false,
  })

  const updateProgress = (update: ProgressUpdate) => {
    progress.value[update.type] = update
  }

  const clearProgress = (type: string) => {
    delete progress.value[type]
  }

  const loadYouTubeChannels = async () => {
    try {
      const data = await $fetch<{ channels: YouTubeChannelConfig[] }>(
        '/api/admin/scrape/youtube-channels'
      )
      youtubeChannels.value = data.channels
    } catch (e) {
      console.error('Failed to load YouTube channels', e)
    }
  }

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
        body: archiveOptions,
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
        body: youtubeOptions,
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

  const startAIExtraction = async () => {
    scraping.value = true
    try {
      const response = await $fetch<{ success: boolean }>('/api/admin/ai/extract-batch', {
        method: 'POST',
        body: aiOptions,
      })

      if (response.success) {
        await refreshStats()
      }
    } catch (error) {
      console.error('AI extraction failed:', error)
    } finally {
      scraping.value = false
    }
  }

  const generateSqlite = async () => {
    generatingSqlite.value = true
    try {
      await $fetch('/api/admin/sqlite/generate', {
        method: 'POST',
      })
    } catch (e) {
      console.error('SQLite generation failed', e)
    } finally {
      generatingSqlite.value = false
    }
  }

  // Computed properties
  const totalExternalVideos = computed(() => {
    if (!stats.value) return 0
    const archiveTotal = stats.value.external.archiveOrg.total || 0
    const youtubeTotal = stats.value.external.youtube.totalAvailable || 0
    return archiveTotal + youtubeTotal
  })

  const youtubeTotalScraped = computed(() => {
    if (!stats.value) return 0
    return stats.value.external.youtube.totalScraped || 0
  })

  const youtubeTotalAvailable = computed(() => {
    if (!stats.value) return 0
    return stats.value.external.youtube.totalAvailable || 0
  })

  const youtubePercent = computed(() => {
    if (youtubeTotalAvailable.value === 0) return 0
    return (youtubeTotalScraped.value / youtubeTotalAvailable.value) * 100
  })

  const databasePercentOfTotal = computed(() => {
    if (!stats.value || totalExternalVideos.value === 0) return 0
    return (stats.value.database.total / totalExternalVideos.value) * 100
  })

  // Failed percentage calculations for stacked bars
  const youtubeFailedPercent = computed(() => {
    if (!stats.value || youtubeTotalAvailable.value === 0) return 0
    const failed = stats.value.external.youtube.totalFailed || 0
    return (failed / youtubeTotalAvailable.value) * 100
  })

  const omdbFailedPercent = computed(() => {
    if (!stats.value || stats.value.omdb.total === 0) return 0
    const failed = stats.value.omdb.failed || 0
    return (failed / stats.value.omdb.total) * 100
  })

  const postersFailedPercent = computed(() => {
    if (!stats.value || stats.value.posters.withPosterUrl === 0) return 0
    const failed = stats.value.posters.failed || 0
    return (failed / stats.value.posters.withPosterUrl) * 100
  })

  const deduplicateDescriptions = async () => {
    deduplicating.value = true
    deduplicationResults.value = null
    try {
      deduplicationResults.value = await $fetch<DeduplicationResult>(
        '/api/admin/data/deduplicate-descriptions',
        {
          method: 'POST',
        }
      )
      await refreshStats()
    } catch (e: unknown) {
      console.error('Description deduplication failed', e)
      deduplicationResults.value = {
        totalSources: 0,
        sourcesWithDescriptions: 0,
        boilerplateRemoved: 0,
        sourcesProcessed: 0,
        descriptionsRemoved: 0,
        patterns: [],
      }
    } finally {
      deduplicating.value = false
    }
  }

  return {
    loading,
    scraping,
    generatingSqlite,
    deduplicating,
    stats,
    results,
    posterResults,
    deduplicationResults,
    youtubeChannels,
    progress,
    archiveOptions,
    youtubeOptions,
    posterOptions,
    omdbOptions,
    aiOptions,
    updateProgress,
    clearProgress,
    loadYouTubeChannels,
    refreshStats,
    startArchiveScrape,
    startYouTubeScrape,
    startPosterDownload,
    startOMDBEnrichment,
    startAIExtraction,
    generateSqlite,
    deduplicateDescriptions,
    totalExternalVideos,
    youtubeTotalScraped,
    youtubeTotalAvailable,
    youtubePercent,
    databasePercentOfTotal,
    youtubeFailedPercent,
    omdbFailedPercent,
    postersFailedPercent,
  }
})
