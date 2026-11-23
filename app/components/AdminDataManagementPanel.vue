<template>
  <section class="bg-theme-surface border border-theme-border rounded-2xl p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h2
        class="text-sm font-bold uppercase tracking-wider text-theme-textmuted flex items-center gap-2"
      >
        <div class="i-mdi-database-cog text-blue-500 text-base"></div>
        Data Management
      </h2>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <!-- Build & Publish -->
      <div class="rounded-xl border border-theme-border bg-theme-background/50 p-3 space-y-2.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-theme-textmuted">
          Build & Publish
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            class="px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="generatingSqlite"
            @click="handleGenerateSqlite"
          >
            <div v-if="generatingSqlite" class="i-mdi-loading animate-spin"></div>
            <div v-else class="i-mdi-database-export"></div>
            {{ generatingSqlite ? 'SQLite...' : 'SQLite DB' }}
          </button>
          <button
            class="px-3 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="generatingEmbeddings"
            @click="handleGenerateEmbeddings"
          >
            <div v-if="generatingEmbeddings" class="i-mdi-loading animate-spin"></div>
            <div v-else class="i-mdi-vector-square"></div>
            {{ generatingEmbeddings ? 'Embeddings...' : 'Embeddings' }}
          </button>
          <button
            class="px-3 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading || generatingSimilar"
            @click="adminStore.generateSimilarMovies()"
          >
            <div class="i-mdi-vector-link" :class="{ 'animate-spin': generatingSimilar }"></div>
            {{ generatingSimilar ? 'Similar...' : 'Similar Movies' }}
          </button>
          <button
            class="px-3 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading || generatingHomePages"
            @click="adminStore.generateHomePages"
          >
            <div class="i-mdi-home-plus" :class="{ 'animate-spin': generatingHomePages }"></div>
            {{ generatingHomePages ? 'Home Pages...' : 'Home Pages' }}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-theme-textmuted">
          <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              v-model="skipJsonGeneration"
              type="checkbox"
              :disabled="generatingSqlite"
              class="rounded border-theme-border accent-blue-600"
            />
            Skip JSONs
          </label>
          <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              v-model="forceRebuildEmbeddings"
              type="checkbox"
              :disabled="generatingEmbeddings"
              class="rounded border-theme-border accent-indigo-600"
            />
            Force rebuild
          </label>
        </div>
      </div>

      <!-- Posters -->
      <div class="rounded-xl border border-theme-border bg-theme-background/50 p-3 space-y-2.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-theme-textmuted">
          Posters
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model.number="posterOptions.limit"
            type="number"
            min="1"
            placeholder="Limit"
            title="Download limit"
            class="w-20 px-2 py-1.5 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text font-mono"
            :disabled="scraping || cleanupLoading"
          />
          <label
            class="inline-flex items-center gap-1.5 text-xs text-theme-textmuted cursor-pointer select-none"
          >
            <input
              v-model="posterOptions.force"
              type="checkbox"
              :disabled="scraping || cleanupLoading"
              class="rounded border-theme-border accent-purple-600"
            />
            Force
          </label>
          <button
            class="ml-auto px-3 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="scraping || cleanupLoading"
            @click="adminStore.startPosterDownload"
          >
            <div v-if="scraping" class="i-mdi-loading animate-spin"></div>
            <div v-else class="i-mdi-download"></div>
            {{ scraping ? 'Downloading...' : 'Download' }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="!confirmingCleanup"
            class="w-full px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="scraping || cleanupLoading"
            @click="requestCleanupConfirmation"
          >
            <div v-if="cleanupLoading" class="i-mdi-loading animate-spin"></div>
            <div v-else class="i-mdi-broom"></div>
            {{ cleanupLoading ? 'Cleaning...' : 'Clean Unlisted Posters' }}
          </button>
          <template v-else>
            <button
              class="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              :disabled="scraping || cleanupLoading"
              @click="executeCleanup"
            >
              Confirm Delete
            </button>
            <button
              class="px-3 py-1.5 text-xs font-medium bg-theme-surface border border-theme-border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              :disabled="cleanupLoading"
              @click="confirmingCleanup = false"
            >
              Cancel
            </button>
          </template>
        </div>
      </div>

      <!-- Maintenance & Archives -->
      <div class="rounded-xl border border-theme-border bg-theme-background/50 p-3 space-y-2.5">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-theme-textmuted">
          Maintenance & Archives
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            class="col-span-2 px-3 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="cleaningCollections"
            @click="adminStore.cleanupCollections"
          >
            <div class="i-mdi-folder-sync" :class="{ 'animate-pulse': cleaningCollections }"></div>
            {{ cleaningCollections ? 'Cleaning Collections...' : 'Clean Collections' }}
          </button>
          <button
            class="px-3 py-2 text-xs font-semibold bg-theme-surface border border-theme-border hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="posterArchiveLoading || databaseArchiveLoading"
            @click="createPosterArchives"
          >
            <div v-if="posterArchiveLoading" class="i-mdi-loading animate-spin"></div>
            <div v-else class="i-mdi-image-multiple text-purple-500"></div>
            {{ posterArchiveLoading ? 'Archiving...' : 'Archive Posters' }}
          </button>
          <button
            class="px-3 py-2 text-xs font-semibold bg-theme-surface border border-theme-border hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="posterArchiveLoading || databaseArchiveLoading"
            @click="createDatabaseArchives"
          >
            <div v-if="databaseArchiveLoading" class="i-mdi-loading animate-spin"></div>
            <div v-else class="i-mdi-database text-blue-500"></div>
            {{ databaseArchiveLoading ? 'Archiving...' : 'Archive DB' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Live Progress & Status Strip -->
    <div v-if="hasStatusActivity" class="space-y-2 pt-1 border-t border-theme-border">
      <!-- Active Progress Bars -->
      <div v-for="item in activeProgressItems" :key="item.key" class="space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">
            <span class="font-semibold text-theme-text">{{ item.label }}:</span>
            {{ item.message }}
          </span>
          <span class="font-mono text-nowrap text-theme-textmuted">
            <template v-if="item.total > 0">{{ item.current }} / {{ item.total }}</template>
            <template v-if="item.extra"> · {{ item.extra }}</template>
          </span>
        </div>
        <div class="h-1.5 bg-theme-border rounded-full overflow-hidden">
          <div v-if="item.starting" class="h-full animate-pulse w-full" :class="item.color"></div>
          <div
            v-else
            class="h-full transition-all duration-300"
            :class="item.color"
            :style="{
              width: item.total > 0 ? `${Math.min(100, (item.current / item.total) * 100)}%` : '0%',
            }"
          ></div>
        </div>
      </div>

      <!-- Compact Result Banners -->
      <div
        v-if="progress.sqlite?.status === 'completed' || progress.sqlite?.status === 'error'"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border"
        :class="
          progress.sqlite.status === 'completed'
            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        "
      >
        <div
          :class="
            progress.sqlite.status === 'completed' ? 'i-mdi-check-circle' : 'i-mdi-alert-circle'
          "
        ></div>
        <span>SQLite: {{ progress.sqlite.message }}</span>
      </div>

      <div
        v-if="progress.similar?.status === 'completed' || progress.similar?.status === 'error'"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border"
        :class="
          progress.similar.status === 'completed'
            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        "
      >
        <div
          :class="
            progress.similar.status === 'completed' ? 'i-mdi-check-circle' : 'i-mdi-alert-circle'
          "
        ></div>
        <span>Similar Movies: {{ progress.similar.message }}</span>
      </div>

      <div
        v-if="embeddingResults"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-check-circle"></div>
          <span v-for="r in embeddingResults" :key="r.model">
            Embeddings ({{ r.model }}): {{ r.processed }} new, {{ r.skipped }} skipped,
            {{ r.totalInDb }} total
          </span>
        </div>
        <button class="opacity-70 hover:opacity-100" @click="embeddingResults = null">
          <div class="i-mdi-close"></div>
        </button>
      </div>

      <div
        v-if="embeddingErrors.length > 0"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-alert-circle"></div>
          <span>{{ embeddingErrors.join(' · ') }}</span>
        </div>
        <button class="opacity-70 hover:opacity-100" @click="embeddingErrors = []">
          <div class="i-mdi-close"></div>
        </button>
      </div>

      <div
        v-if="cleanupResult"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 border"
        :class="
          cleanupResult.removedCount > 0
            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
        "
      >
        <div class="flex items-center gap-2">
          <div
            :class="cleanupResult.removedCount > 0 ? 'i-mdi-check-circle' : 'i-mdi-information'"
          ></div>
          <span v-if="cleanupResult.removedCount > 0">
            Posters: removed {{ cleanupResult.removedCount }} unlisted ({{
              formatBytes(cleanupResult.freedBytes)
            }}
            freed, {{ cleanupResult.remainingCount }} remaining)
          </span>
          <span v-else> Posters: all {{ cleanupResult.totalScanned }} files are listed </span>
        </div>
        <button class="opacity-70 hover:opacity-100" @click="cleanupResult = null">
          <div class="i-mdi-close"></div>
        </button>
      </div>

      <div
        v-if="cleanupError"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-alert-circle"></div>
          <span>Poster cleanup: {{ cleanupError }}</span>
        </div>
        <button class="opacity-70 hover:opacity-100" @click="cleanupError = null">
          <div class="i-mdi-close"></div>
        </button>
      </div>

      <div
        v-if="collectionCleanupResults"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border"
        :class="
          collectionCleanupResults.success
            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        "
      >
        <div
          :class="collectionCleanupResults.success ? 'i-mdi-check-circle' : 'i-mdi-alert-circle'"
        ></div>
        <span v-if="collectionCleanupResults.success">
          Collections: {{ collectionCleanupResults.stats.collectionsModified }} modified,
          {{ collectionCleanupResults.stats.moviesRemoved }} removed,
          {{ collectionCleanupResults.stats.moviesUpdated }} IDs updated
        </span>
        <span v-else>Collection cleanup failed</span>
      </div>

      <div
        v-if="posterArchiveResult"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 border"
        :class="
          posterArchiveResult.success
            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        "
      >
        <div class="flex items-center gap-2">
          <div
            :class="posterArchiveResult.success ? 'i-mdi-check-circle' : 'i-mdi-alert-circle'"
          ></div>
          <span v-if="posterArchiveResult.success">
            Poster archives: {{ posterArchiveResult.archivesCreated }} archive(s),
            {{ posterArchiveResult.totalPosters }} posters ({{ posterArchiveResult.totalSize }})
          </span>
          <span v-else>Poster archive failed: {{ posterArchiveResult.error }}</span>
        </div>
        <button class="opacity-70 hover:opacity-100" @click="posterArchiveResult = null">
          <div class="i-mdi-close"></div>
        </button>
      </div>

      <div
        v-if="databaseArchiveResult"
        class="px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 border"
        :class="
          databaseArchiveResult.success
            ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        "
      >
        <div class="flex items-center gap-2">
          <div
            :class="databaseArchiveResult.success ? 'i-mdi-check-circle' : 'i-mdi-alert-circle'"
          ></div>
          <span v-if="databaseArchiveResult.success">
            DB archives: {{ databaseArchiveResult.archivesCreated }} archive(s) ({{
              databaseArchiveResult.totalSize
            }})
          </span>
          <span v-else>DB archive failed: {{ databaseArchiveResult.error }}</span>
        </div>
        <button class="opacity-70 hover:opacity-100" @click="databaseArchiveResult = null">
          <div class="i-mdi-close"></div>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from '#imports'
import { $fetch } from '#build/fetch'
import { useAdminStore } from '~/stores/useAdminStore'

interface EmbeddingModelResult {
  model: string
  processed: number
  skipped: number
  failed: number
  totalInDb: number
}

interface PosterCleanupResponse {
  removedCount: number
  freedBytes: number
  remainingCount: number
  totalScanned: number
}

interface PosterArchiveResult {
  success: boolean
  archivesCreated: number
  totalPosters: number
  totalSize: string
  error?: string
}

interface DatabaseArchiveResult {
  success: boolean
  archivesCreated: number
  totalSize: string
  error?: string
}

const adminStore = useAdminStore()
const {
  loading,
  scraping,
  generatingHomePages,
  generatingSimilar,
  generatingSqlite,
  cleaningCollections,
  collectionCleanupResults,
  posterOptions,
  progress,
} = storeToRefs(adminStore)

// SQLite & Embeddings options
const skipJsonGeneration = ref(false)
const forceRebuildEmbeddings = ref(false)
const generatingEmbeddings = ref(false)
const embeddingResults = ref<EmbeddingModelResult[] | null>(null)
const embeddingErrors = ref<string[]>([])

// Poster cleanup state
const cleanupLoading = ref(false)
const confirmingCleanup = ref(false)
const cleanupResult = ref<PosterCleanupResponse | null>(null)
const cleanupError = ref<string | null>(null)

// Archive state
const posterArchiveLoading = ref(false)
const databaseArchiveLoading = ref(false)
const posterArchiveResult = ref<PosterArchiveResult | null>(null)
const databaseArchiveResult = ref<DatabaseArchiveResult | null>(null)

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

const activeProgressItems = computed(() => {
  const items: Array<{
    key: string
    label: string
    message: string
    current: number
    total: number
    starting: boolean
    color: string
    extra?: string
  }> = []

  const p = progress.value
  if (p.sqlite && (p.sqlite.status === 'starting' || p.sqlite.status === 'in_progress')) {
    items.push({
      key: 'sqlite',
      label: 'SQLite',
      message: p.sqlite.message || 'Generating...',
      current: p.sqlite.current,
      total: p.sqlite.total,
      starting: p.sqlite.status === 'starting',
      color: 'bg-blue-500',
    })
  }
  if (
    p.embeddings &&
    (p.embeddings.status === 'starting' || p.embeddings.status === 'in_progress')
  ) {
    const extras: string[] = []
    if (p.embeddings.embeddingsPerSecond) extras.push(`${p.embeddings.embeddingsPerSecond}/s`)
    if (p.embeddings.estimatedTimeRemaining)
      extras.push(`ETA ${formatETA(p.embeddings.estimatedTimeRemaining)}`)
    items.push({
      key: 'embeddings',
      label: 'Embeddings',
      message: p.embeddings.message || 'Generating...',
      current: p.embeddings.current,
      total: p.embeddings.total,
      starting: p.embeddings.status === 'starting',
      color: 'bg-indigo-500',
      extra: extras.join(' · ') || undefined,
    })
  }
  if (p.similar && (p.similar.status === 'starting' || p.similar.status === 'in_progress')) {
    items.push({
      key: 'similar',
      label: 'Similar',
      message: p.similar.message || 'Generating...',
      current: p.similar.current,
      total: p.similar.total,
      starting: p.similar.status === 'starting',
      color: 'bg-purple-500',
    })
  }
  if (p.home && (p.home.status === 'starting' || p.home.status === 'in_progress')) {
    items.push({
      key: 'home',
      label: 'Home Pages',
      message: p.home.message || 'Generating...',
      current: p.home.current,
      total: p.home.total,
      starting: p.home.status === 'starting',
      color: 'bg-sky-500',
    })
  }
  if (p.posters && p.posters.status === 'in_progress') {
    items.push({
      key: 'posters',
      label: 'Posters',
      message: p.posters.message || 'Downloading...',
      current: p.posters.current,
      total: p.posters.total,
      starting: false,
      color: 'bg-purple-500',
    })
  }
  if (p.posterArchive && p.posterArchive.status === 'in_progress') {
    items.push({
      key: 'posterArchive',
      label: 'Poster Archive',
      message: p.posterArchive.message || 'Archiving...',
      current: p.posterArchive.current,
      total: p.posterArchive.total,
      starting: false,
      color: 'bg-purple-500',
    })
  }
  if (p.databaseArchive && p.databaseArchive.status === 'in_progress') {
    items.push({
      key: 'databaseArchive',
      label: 'DB Archive',
      message: p.databaseArchive.message || 'Archiving...',
      current: p.databaseArchive.current,
      total: p.databaseArchive.total,
      starting: false,
      color: 'bg-blue-500',
    })
  }

  return items
})

const hasStatusActivity = computed(() => {
  const p = progress.value
  return (
    activeProgressItems.value.length > 0 ||
    p.sqlite?.status === 'completed' ||
    p.sqlite?.status === 'error' ||
    p.similar?.status === 'completed' ||
    p.similar?.status === 'error' ||
    embeddingResults.value !== null ||
    embeddingErrors.value.length > 0 ||
    cleanupResult.value !== null ||
    cleanupError.value !== null ||
    collectionCleanupResults.value !== null ||
    posterArchiveResult.value !== null ||
    databaseArchiveResult.value !== null
  )
})

async function handleGenerateSqlite() {
  adminStore.updateProgress({
    type: 'sqlite',
    status: 'starting',
    current: 0,
    total: 0,
    message: 'Starting SQLite generation...',
  })
  await adminStore.generateSqlite({
    skipJsonGeneration: skipJsonGeneration.value,
  })
}

async function handleGenerateEmbeddings() {
  generatingEmbeddings.value = true
  embeddingResults.value = null
  embeddingErrors.value = []

  try {
    const response = await $fetch<{
      success: boolean
      results: EmbeddingModelResult[]
      errors: string[]
    }>('/api/admin/embeddings/generate', {
      method: 'POST',
      body: {
        models: ['leaf-ir'],
        forceRebuild: forceRebuildEmbeddings.value,
      },
    })
    embeddingResults.value = response.results
    if (response.errors.length > 0) {
      embeddingErrors.value = response.errors
    }
  } catch (error) {
    embeddingErrors.value = [
      error instanceof Error ? error.message : 'Failed to generate embeddings',
    ]
  } finally {
    generatingEmbeddings.value = false
  }
}

function requestCleanupConfirmation() {
  cleanupResult.value = null
  cleanupError.value = null
  confirmingCleanup.value = true
}

async function executeCleanup() {
  cleanupLoading.value = true
  cleanupResult.value = null
  cleanupError.value = null
  confirmingCleanup.value = false

  try {
    cleanupResult.value = await $fetch<PosterCleanupResponse>('/api/admin/posters/cleanup', {
      method: 'POST',
      body: { scope: 'listed' },
    })
  } catch (error) {
    cleanupError.value = error instanceof Error ? error.message : 'Failed to clean up posters'
  } finally {
    cleanupLoading.value = false
  }
}

async function createPosterArchives() {
  posterArchiveLoading.value = true
  posterArchiveResult.value = null

  try {
    posterArchiveResult.value = await $fetch<PosterArchiveResult>('/api/admin/posters/archive', {
      method: 'POST',
    })
  } catch (error) {
    posterArchiveResult.value = {
      success: false,
      archivesCreated: 0,
      totalPosters: 0,
      totalSize: '0 B',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    posterArchiveLoading.value = false
  }
}

async function createDatabaseArchives() {
  databaseArchiveLoading.value = true
  databaseArchiveResult.value = null

  try {
    databaseArchiveResult.value = await $fetch<DatabaseArchiveResult>(
      '/api/admin/database/archive',
      {
        method: 'POST',
      }
    )
  } catch (error) {
    databaseArchiveResult.value = {
      success: false,
      archivesCreated: 0,
      totalSize: '0 B',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    databaseArchiveLoading.value = false
  }
}
</script>
