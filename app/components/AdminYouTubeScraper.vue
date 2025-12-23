<template>
  <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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

      <div class="space-y-2">
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Videos per channel</label>
        <input
          v-model="options.limit"
          type="number"
          class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
        >
      </div>

      <div class="flex flex-col gap-3">
        <label class="flex items-center gap-3 cursor-pointer group">
          <div class="relative">
            <input
              v-model="options.allPages"
              type="checkbox"
              class="sr-only peer"
            >
            <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          </div>
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Scrape all pages (ignore limit)</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer group">
          <div class="relative">
            <input
              v-model="options.skipOmdb"
              type="checkbox"
              class="sr-only peer"
            >
            <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          </div>
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Skip OMDB matching (faster)</span>
        </label>
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
import { useAdminStore } from '~/stores/useAdminStore'

interface YouTubeOptions {
  limit: number
  skipOmdb: boolean
  allPages: boolean
  channels: string[]
}

interface YouTubeChannelConfig {
  id: string
  name: string
  enabled: boolean
  language?: string
}

const props = defineProps<{
  modelValue: YouTubeOptions
  channels: YouTubeChannelConfig[]
  loading: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: YouTubeOptions]
  'start': []
}>()

const adminStore = useAdminStore()
const progress = computed(() => adminStore.progress.youtube)

const options = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>
