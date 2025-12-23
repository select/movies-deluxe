<template>
  <div
    class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
  >
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-youtube text-red-500" />
      YouTube Scraper
    </h2>

    <div class="space-y-6">
      <div class="space-y-2">
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Select Channels</label>
        <div class="border border-gray-200 dark:border-gray-700 rounded-xl p-2 space-y-1">
          <label
            v-for="channel in channels"
            :key="channel.id"
            class="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer text-sm"
          >
            <input
              v-model="options.channels"
              type="checkbox"
              :value="channel.id"
              class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            >
            <span>{{ channel.name }}</span>
            <span class="text-xs text-gray-400">({{ channel.language }})</span>
          </label>
        </div>
        <p class="text-[10px] text-gray-400">
          If none selected, all enabled channels will be processed.
        </p>
      </div>

      <AppInputNumber
        v-model="options.limit"
        label="Videos per channel"
      />

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.allPages"
          label="Scrape all pages (ignore limit)"
          @change="options.allPages = $event"
        />
        <AppInputSwitch
          :checked="options.skipOmdb"
          label="Skip OMDB matching (faster)"
          @change="options.skipOmdb = $event"
        />
      </div>

      <button
        class="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        {{ loading ? 'Scraping in progress...' : 'Start YouTube Scrape' }}
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
            class="h-full bg-red-600 transition-all duration-300"
            :style="{ width: `${(progress.current / progress.total) * 100}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { YouTubeOptions, YouTubeChannelConfig } from '~/types/admin'

const options = defineModel<YouTubeOptions>({ required: true })

defineProps<{
  channels: YouTubeChannelConfig[]
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const adminStore = useAdminStore()
const progress = computed(() => adminStore.progress.youtube)
</script>
