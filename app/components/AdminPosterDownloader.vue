<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-image-multiple text-purple-500"></div>
      Poster Downloader
    </h2>

    <div class="space-y-6">
      <AppInputNumber v-model="options.limit" label="Download limit" />

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.force"
          label="Force re-download"
          @change="options.force = $event"
        />
      </div>

      <button
        class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div v-if="loading" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-download"></div>
        {{ loading ? 'Downloading...' : 'Download Posters' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress.posters && progress.posters.status === 'in_progress'"
        class="mt-4 space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{ progress.posters.message }}</span>
          <span class="font-mono text-nowrap"
            >{{ progress.posters.current }} / {{ progress.posters.total }}</span
          >
        </div>
        <div class="h-2 bg-theme-border rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 transition-all duration-300"
            :style="{ width: `${(progress.posters.current / progress.posters.total) * 100}%` }"
          ></div>
        </div>
      </div>

      <!-- Poster Cleanup -->
      <div class="border-t border-theme-border pt-6 space-y-4">
        <button
          class="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          :disabled="loading || cleanupLoading"
          @click="executeCleanup"
        >
          <div v-if="cleanupLoading" class="i-mdi-loading animate-spin"></div>
          <div v-else class="i-mdi-broom"></div>
          {{ cleanupLoading ? 'Cleaning Up Posters...' : 'Clean Up Unlisted Posters' }}
        </button>

        <!-- Cleanup Result -->
        <div
          v-if="cleanupResult"
          class="p-4 rounded-xl border flex items-start gap-2 text-sm"
          :class="
            cleanupResult.removedCount > 0
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          "
        >
          <div
            class="text-lg shrink-0 mt-0.5"
            :class="
              cleanupResult.removedCount > 0
                ? 'i-mdi-check-circle text-green-600 dark:text-green-400'
                : 'i-mdi-information text-blue-600 dark:text-blue-400'
            "
          ></div>
          <div
            :class="
              cleanupResult.removedCount > 0
                ? 'text-green-800 dark:text-green-200'
                : 'text-blue-800 dark:text-blue-200'
            "
          >
            <template v-if="cleanupResult.removedCount > 0">
              Removed {{ cleanupResult.removedCount }} unlisted poster(s), freed
              {{ formatBytes(cleanupResult.freedBytes) }}.
              {{ cleanupResult.remainingCount }} poster(s) remaining.
            </template>
            <template v-else>
              All {{ cleanupResult.totalScanned }} posters are listed. No unlisted posters removed.
            </template>
          </div>
        </div>

        <!-- Cleanup Error -->
        <div
          v-if="cleanupError"
          class="p-4 rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 flex items-start gap-2 text-sm"
        >
          <div
            class="i-mdi-alert-circle text-red-600 dark:text-red-400 text-lg shrink-0 mt-0.5"
          ></div>
          <div class="text-red-800 dark:text-red-200">{{ cleanupError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PosterOptions } from '~/types/admin'
import { ref } from 'vue'
import { storeToRefs } from '#imports'
import { $fetch } from '#build/fetch'
import { useAdminStore } from '~/stores/useAdminStore'
import AppInputNumber from '~/components/AppInputNumber.vue'
import AppInputSwitch from '~/components/AppInputSwitch.vue'

interface PosterCleanupResponse {
  removedCount: number
  freedBytes: number
  remainingCount: number
  totalScanned: number
  scope: 'listed' | 'admin'
  dryRun: boolean
  sampleRemovedIds: string[]
}

const options = defineModel<PosterOptions>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const adminStore = useAdminStore()
const { progress } = storeToRefs(adminStore)

const cleanupLoading = ref(false)
const cleanupResult = ref<PosterCleanupResponse | null>(null)
const cleanupError = ref<string | null>(null)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

async function executeCleanup() {
  cleanupLoading.value = true
  cleanupResult.value = null
  cleanupError.value = null

  try {
    const res = await $fetch<PosterCleanupResponse>('/api/admin/posters/cleanup', {
      method: 'POST',
      body: { dryRun: false, scope: 'listed' },
    })
    cleanupResult.value = res
    await adminStore.refreshStats()
  } catch (error) {
    cleanupError.value = error instanceof Error ? error.message : 'Failed to clean up posters'
  } finally {
    cleanupLoading.value = false
  }
}
</script>
