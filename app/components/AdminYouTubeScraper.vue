<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-youtube text-red-500"></div>
      YouTube Scraper
    </h2>

    <div class="space-y-6">
      <div class="space-y-2">
        <label class="text-sm font-medium text-theme-textmuted">Select Channels</label>
        <label
          v-for="channel in channels"
          :key="channel.id"
          class="flex items-center gap-2 px-2 py-1 hover:bg-theme-selection rounded cursor-pointer text-sm"
        >
          <input
            v-model="options.channels"
            type="checkbox"
            :value="channel.id"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>{{ channel.name }}</span>
          <span class="text-xs text-theme-textmuted">({{ channel.language }})</span>
        </label>

        <p class="text-[10px] text-theme-textmuted">
          If none selected, all enabled channels will be processed.
        </p>
      </div>

      <button
        class="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div v-if="loading" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-play"></div>
        {{ loading ? 'Scraping in progress...' : 'Start YouTube Scrape' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress.youtube && progress.youtube.status === 'in_progress'"
        class="mt-4 space-y-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{ progress.youtube.message }}</span>
          <span class="font-mono text-nowrap"
            >{{ progress.youtube.current }} / {{ progress.youtube.total || '?' }}</span
          >
        </div>

        <!-- Dual Progress Bar -->
        <div class="h-3 bg-theme-border rounded-full overflow-hidden flex">
          <div
            v-if="progress.youtube.total"
            class="h-full bg-green-500 transition-all duration-300"
            :style="{
              width: `${((progress.youtube.successCurrent || 0) / progress.youtube.total) * 100}%`,
            }"
            title="Success"
          ></div>
          <div
            v-if="progress.youtube.total"
            class="h-full bg-orange-500 transition-all duration-300"
            :style="{
              width: `${((progress.youtube.failedCurrent || 0) / progress.youtube.total) * 100}%`,
            }"
            title="Failed"
          ></div>
          <div
            v-if="progress.youtube.total"
            class="h-full bg-red-600/20 transition-all duration-300"
            :style="{
              width: `${(Math.max(0, progress.youtube.current - (progress.youtube.successCurrent || 0) - (progress.youtube.failedCurrent || 0)) / progress.youtube.total) * 100}%`,
            }"
          ></div>
        </div>

        <!-- Stats Breakdown -->
        <div class="grid grid-cols-2 gap-2 text-[10px] font-medium">
          <div class="flex items-center gap-1 text-green-600 dark:text-green-400">
            <div class="i-mdi-check-circle"></div>
            Success:
            {{ (progress.youtube.successCurrent || 0) + (progress.youtube.successPrevious || 0) }}
          </div>
          <div class="flex items-center gap-1 text-orange-600 dark:text-orange-400">
            <div class="i-mdi-alert-circle"></div>
            Failed:
            {{ (progress.youtube.failedCurrent || 0) + (progress.youtube.failedPrevious || 0) }}
          </div>
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

const { progress } = storeToRefs(useAdminStore())
</script>
