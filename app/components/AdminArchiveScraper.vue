<template>
  <div
    class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
  >
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-archive text-amber-500" />
      Archive.org Scraper
    </h2>

    <div class="space-y-6">
      <div class="grid grid-cols-2 gap-4">
        <AppInputNumber
          v-model="options.rows"
          label="Rows per page"
        />
        <AppInputNumber
          v-model="options.pages"
          label="Pages to fetch"
        />
      </div>

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.autoDetect"
          label="Auto-detect starting page"
          @change="options.autoDetect = $event"
        />
        <AppInputSwitch
          :checked="options.skipOmdb"
          label="Skip OMDB matching (faster)"
          @change="options.skipOmdb = $event"
        />
      </div>

      <button
        class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          v-if="loading"
          class="i-mdi-loading animate-spin"
        />
        <div
          v-else
          class="i-mdi-play"
        />
        {{ loading ? 'Scraping in progress...' : 'Start Archive.org Scrape' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress && progress.status === 'in_progress'"
        class="mt-4 space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 truncate mr-2">{{ progress.message }}</span>
          <span class="font-mono">{{ progress.current }} / {{ progress.total }}</span>
        </div>
        <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-amber-500 transition-all duration-300"
            :style="{ width: `${(progress.current / progress.total) * 100}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminStore } from '~/stores/useAdminStore'
import type { ArchiveOptions } from '~/types/admin'

const options = defineModel<ArchiveOptions>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const adminStore = useAdminStore()
const progress = computed(() => adminStore.progress.archive)
</script>
