<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-archive text-blue-500"></div>
      Data Archiver
    </h2>

    <div class="space-y-6">
      <!-- Poster Archive Progress Display -->
      <div
        v-if="progress.posterArchive && progress.posterArchive.status === 'in_progress'"
        class="space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{
            progress.posterArchive.message
          }}</span>
          <span class="font-mono text-nowrap"
            >{{ progress.posterArchive.current }} / {{ progress.posterArchive.total }}</span
          >
        </div>
        <div class="h-2 bg-theme-border rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 transition-all duration-300"
            :style="{
              width: `${(progress.posterArchive.current / progress.posterArchive.total) * 100}%`,
            }"
          ></div>
        </div>
      </div>

      <!-- Database Archive Progress Display -->
      <div
        v-if="progress.databaseArchive && progress.databaseArchive.status === 'in_progress'"
        class="space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{
            progress.databaseArchive.message
          }}</span>
          <span class="font-mono text-nowrap"
            >{{ progress.databaseArchive.current }} / {{ progress.databaseArchive.total }}</span
          >
        </div>
        <div class="h-2 bg-theme-border rounded-full overflow-hidden">
          <div
            class="h-full bg-blue-500 transition-all duration-300"
            :style="{
              width: `${(progress.databaseArchive.current / progress.databaseArchive.total) * 100}%`,
            }"
          ></div>
        </div>
      </div>

      <!-- Poster Results Display -->
      <div
        v-if="posterResults"
        class="p-4 rounded-lg border"
        :class="
          posterResults.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        "
      >
        <div v-if="posterResults.success" class="space-y-3">
          <div class="flex items-start gap-2">
            <div
              class="i-mdi-check-circle text-green-600 dark:text-green-400 text-xl flex-shrink-0 mt-0.5"
            ></div>
            <div class="flex-1">
              <p class="font-semibold text-green-800 dark:text-green-200">
                Poster Archives Created Successfully
              </p>
              <p class="text-sm text-green-700 dark:text-green-300 mt-1">
                Created {{ posterResults.archivesCreated }} archive{{
                  posterResults.archivesCreated !== 1 ? 's' : ''
                }}
                containing {{ posterResults.totalPosters }} posters ({{ posterResults.totalSize }})
              </p>
            </div>
          </div>

          <!-- Archive Details -->
          <div v-if="posterResults.archives.length > 0" class="mt-3 space-y-2">
            <p class="text-xs font-semibold text-green-800 dark:text-green-200 uppercase">
              Archives:
            </p>
            <div class="space-y-1">
              <div
                v-for="archive in posterResults.archives"
                :key="archive.filename"
                class="flex items-center justify-between text-xs bg-white dark:bg-gray-800 p-2 rounded border border-green-200 dark:border-green-700"
              >
                <span class="font-mono text-green-700 dark:text-green-300">{{
                  archive.filename
                }}</span>
                <span class="text-green-600 dark:text-green-400">
                  {{ archive.posterCount }} posters • {{ archive.size }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex items-start gap-2">
          <div
            class="i-mdi-alert-circle text-red-600 dark:text-red-400 text-xl flex-shrink-0 mt-0.5"
          ></div>
          <div>
            <p class="font-semibold text-red-800 dark:text-red-200">
              Poster Archive Creation Failed
            </p>
            <p class="text-sm text-red-700 dark:text-red-300 mt-1">
              {{ posterResults.error }}
            </p>
          </div>
        </div>
      </div>

      <!-- Database Results Display -->
      <div
        v-if="databaseResults"
        class="p-4 rounded-lg border"
        :class="
          databaseResults.success
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        "
      >
        <div v-if="databaseResults.success" class="space-y-3">
          <div class="flex items-start gap-2">
            <div
              class="i-mdi-check-circle text-blue-600 dark:text-blue-400 text-xl flex-shrink-0 mt-0.5"
            ></div>
            <div class="flex-1">
              <p class="font-semibold text-blue-800 dark:text-blue-200">
                Database Archives Created Successfully
              </p>
              <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Created {{ databaseResults.archivesCreated }} archive{{
                  databaseResults.archivesCreated !== 1 ? 's' : ''
                }}
                ({{ databaseResults.totalSize }})
              </p>
            </div>
          </div>

          <!-- Archive Details -->
          <div v-if="databaseResults.archives.length > 0" class="mt-3 space-y-2">
            <p class="text-xs font-semibold text-blue-800 dark:text-blue-200 uppercase">
              Archives:
            </p>
            <div class="space-y-1">
              <div
                v-for="archive in databaseResults.archives"
                :key="archive.filename"
                class="flex items-center justify-between text-xs bg-white dark:bg-gray-800 p-2 rounded border border-blue-200 dark:border-blue-700"
              >
                <span class="font-mono text-blue-700 dark:text-blue-300">{{
                  archive.filename
                }}</span>
                <span class="text-blue-600 dark:text-blue-400">
                  {{ archive.size }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex items-start gap-2">
          <div
            class="i-mdi-alert-circle text-red-600 dark:text-red-400 text-xl flex-shrink-0 mt-0.5"
          ></div>
          <div>
            <p class="font-semibold text-red-800 dark:text-red-200">
              Database Archive Creation Failed
            </p>
            <p class="text-sm text-red-700 dark:text-red-300 mt-1">
              {{ databaseResults.error }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <button
        class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
        :disabled="posterLoading || databaseLoading"
        @click="createPosterArchives"
      >
        <div v-if="posterLoading" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-image-multiple"></div>
        {{ posterLoading ? 'Archiving...' : 'Archive Posters' }}
      </button>

      <button
        class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
        :disabled="posterLoading || databaseLoading"
        @click="createDatabaseArchives"
      >
        <div v-if="databaseLoading" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-database"></div>
        {{ databaseLoading ? 'Archiving...' : 'Archive Database' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PosterArchiveResult {
  success: boolean
  archivesCreated: number
  totalPosters: number
  totalSize: string
  archives: Array<{
    filename: string
    posterCount: number
    size: string
  }>
  error?: string
}

interface DatabaseArchiveResult {
  success: boolean
  archivesCreated: number
  totalSize: string
  archives: Array<{
    filename: string
    size: string
  }>
  error?: string
}

const posterLoading = ref(false)
const databaseLoading = ref(false)
const posterResults = ref<PosterArchiveResult | null>(null)
const databaseResults = ref<DatabaseArchiveResult | null>(null)
const { progress } = storeToRefs(useAdminStore())

async function createPosterArchives() {
  posterLoading.value = true
  posterResults.value = null

  try {
    const response = await $fetch<PosterArchiveResult>('/api/admin/posters/archive', {
      method: 'POST',
    })

    posterResults.value = response
  } catch (error) {
    posterResults.value = {
      success: false,
      archivesCreated: 0,
      totalPosters: 0,
      totalSize: '0 B',
      archives: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  } finally {
    posterLoading.value = false
  }
}

async function createDatabaseArchives() {
  databaseLoading.value = true
  databaseResults.value = null

  try {
    const response = await $fetch<DatabaseArchiveResult>('/api/admin/database/archive', {
      method: 'POST',
    })

    databaseResults.value = response
  } catch (error) {
    databaseResults.value = {
      success: false,
      archivesCreated: 0,
      totalSize: '0 B',
      archives: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  } finally {
    databaseLoading.value = false
  }
}
</script>
