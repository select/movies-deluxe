<template>
  <section class="space-y-4">
    <h2 class="text-xl font-bold flex items-center gap-2">
      <div class="i-mdi-youtube text-red-500" />
      YouTube Channel Statistics
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="channel in channels"
        :key="channel.id"
        class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-bold truncate pr-2">{{ channel.name }}</span>
          <div
            class="w-2 h-2 rounded-full"
            :class="channel.enabled ? 'bg-green-500' : 'bg-gray-300'"
            :title="channel.enabled ? 'Enabled' : 'Disabled'"
          />
        </div>
        <div class="text-xl font-bold">
          {{ channel.scraped }}
        </div>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-red-500 transition-all duration-1000"
              :style="{ width: `${channel.total > 0 ? (channel.scraped / channel.total) * 100 : 0}%` }"
            />
          </div>
          <span class="text-[10px] font-medium">{{ channel.total > 0 ? ((channel.scraped / channel.total) * 100).toFixed(0) : 0 }}%</span>
        </div>
        <div class="text-[10px] text-gray-500 mt-1">
          {{ channel.scraped }} / {{ channel.total || '?' }} videos
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface YouTubeChannelStats {
  id: string
  name: string
  enabled: boolean
  scraped: number
  total: number
}

defineProps<{
  channels: YouTubeChannelStats[]
}>()
</script>
