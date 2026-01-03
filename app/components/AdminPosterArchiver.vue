<template>
  <div class="bg-theme-surface p-6 rounded-xl border border-theme-border shadow-sm">
    <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
      <div class="i-mdi-archive text-purple-600" />
      Poster Archiver
    </h3>

    <div class="space-y-4">
      <p class="text-sm text-theme-textmuted">
        Create tar.gz archives of all posters. Archives are split into &lt;50MB chunks and saved to the
        <code class="px-1 py-0.5 bg-theme-background rounded text-xs">/data</code> directory.
      </p>

      <!-- Progress Display -->
      <div
        v-if="progress.posterArchive && progress.posterArchive.status === 'in_progress'"
        class="space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{ progress.posterArchive.message }}</span>
          <span class="font-mono text-nowrap">{{ progress.posterArchive.current }} / {{ progress.posterArchive.total }}</span>
        </div>
        <div class="h-2 bg-theme-border rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 transition-all duration-300"
            :style="{ width: `${(progress.posterArchive.current / progress.posterArchive.total) * 100}%` }"
          />
        </div>
      </div>

      <!-- Results Display -->
      <div
        v-if="results"
        class="p-4 rounded-lg border"
        :class="results.success ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'"
      >
        <div
          v-if="results.success"
          class="space-y-3"
        >
          <div class="flex items-start gap-2">
            <div class="i-mdi-check-circle text-green-600 dark:text-green-400 text-xl flex-shrink-0 mt-0.5" />
            <div class="flex-1">
              <p class="font-semibold text-green-800 dark:text-green-200">
                Archives Created Successfully
              </p>
              <p class="text-sm text-green-700 dark:text-green-300 mt-1">
                Created {{ results.archivesCreated }} archive{{ results.archivesCreated !== 1 ? 's' : '' }}
                containing {{ results.totalPosters }} posters ({{ results.totalSize }})
              </p>
            </div>
          </div>

          <!-- Archive Details -->
          <div
            v-if="results.archives.length > 0"
            class="mt-3 space-y-2"
          >
            <p class="text-xs font-semibold text-green-800 dark:text-green-200 uppercase">
              Archives:
            </p>
            <div class="space-y-1">
              <div
                v-for="archive in results.archives"
                :key="archive.filename"
                class="flex items-center justify-between text-xs bg-white dark:bg-gray-800 p-2 rounded border border-green-200 dark:border-green-700"
              >
                <span class="font-mono text-green-700 dark:text-green-300">{{ archive.filename }}</span>
                <span class="text-green-600 dark:text-green-400">
                  {{ archive.posterCount }} posters • {{ archive.size }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex items-start gap-2"
        >
          <div class="i-mdi-alert-circle text-red-600 dark:text-red-400 text-xl flex-shrink-0 mt-0.5" />
          <div>
            <p class="font-semibold text-red-800 dark:text-red-200">
              Archive Creation Failed
            </p>
            <p class="text-sm text-red-700 dark:text-red-300 mt-1">
              {{ results.error }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Button -->
      <button
        class="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
        :disabled="loading"
        @click="createArchives"
      >
        <div
          class="i-mdi-archive"
          :class="{ 'animate-spin': loading }"
        />
        {{ loading ? 'Creating Archives...' : 'Create Poster Archives' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ArchiveResult {
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

const loading = ref(false)
const results = ref<ArchiveResult | null>(null)
const { progress } = storeToRefs(useAdminStore())

async function createArchives() {
  loading.value = true
  results.value = null

  try {
    const response = await $fetch<ArchiveResult>('/api/admin/posters/archive', {
      method: 'POST',
    })

    results.value = response
  } catch (error) {
    results.value = {
      success: false,
      archivesCreated: 0,
      totalPosters: 0,
      totalSize: '0 B',
      archives: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  } finally {
    loading.value = false
  }
}
</script>
