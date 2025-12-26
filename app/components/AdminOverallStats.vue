<template>
  <section class="space-y-4">
    <h2 class="text-xl font-bold flex items-center gap-2">
      <div class="i-mdi-chart-box text-blue-500" />
      Overall Statistics
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Archive.org Stats -->
      <div
        class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-bold truncate pr-2 flex items-center gap-2">
            <div class="i-mdi-archive text-amber-500" />
            Archive.org
          </span>
          <div
            class="w-2 h-2 rounded-full bg-green-500"
            title="Active"
          />
        </div>
        <div class="text-xl font-bold flex items-baseline gap-2">
          {{ (archiveOrg.scraped || 0).toLocaleString() }}
          <span
            v-if="archiveOrg.failed && archiveOrg.failed > 0"
            class="text-xs font-medium text-orange-500"
            :title="`${archiveOrg.failed} failed videos`"
          >
            +{{ archiveOrg.failed }} failed
          </span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div
              class="h-full bg-amber-500 transition-all duration-1000"
              :style="{ width: `${archiveOrg.percent || 0}%` }"
            />
            <div
              v-if="archiveOrg.failed && archiveOrg.failed > 0"
              class="h-full bg-orange-400 transition-all duration-1000"
              :style="{ width: `${archiveOrg.total > 0 ? (archiveOrg.failed / archiveOrg.total) * 100 : 0}%` }"
            />
          </div>
          <span class="text-[10px] font-medium">{{ (archiveOrg.percent || 0).toFixed(0) }}%</span>
        </div>
        <div class="flex items-center justify-between text-[10px] text-gray-500 mt-1">
          <span>{{ (archiveOrg.scraped || 0).toLocaleString() }} / {{ (archiveOrg.total || 0).toLocaleString() || '?' }} videos</span>
          <span
            v-if="archiveOrg.failureRate && archiveOrg.failureRate > 0"
            :class="archiveOrg.failureRate > 20 ? 'text-red-500 font-bold' : 'text-orange-500'"
          >
            {{ archiveOrg.failureRate.toFixed(1) }}% fail
          </span>
        </div>
      </div>

      <!-- YouTube Total Stats -->
      <div
        class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-bold truncate pr-2 flex items-center gap-2">
            <div class="i-mdi-youtube text-red-500" />
            YouTube (All Channels)
          </span>
          <div
            class="w-2 h-2 rounded-full bg-green-500"
            title="Active"
          />
        </div>
        <div class="text-xl font-bold flex items-baseline gap-2">
          {{ (youtube.totalScraped || 0).toLocaleString() }}
          <span
            v-if="youtube.totalFailed && youtube.totalFailed > 0"
            class="text-xs font-medium text-orange-500"
            :title="`${youtube.totalFailed} failed videos`"
          >
            +{{ youtube.totalFailed }} failed
          </span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div
              class="h-full bg-red-500 transition-all duration-1000"
              :style="{ width: `${youtube.percent || 0}%` }"
            />
            <div
              v-if="youtube.totalFailed && youtube.totalFailed > 0"
              class="h-full bg-orange-400 transition-all duration-1000"
              :style="{ width: `${youtube.totalAvailable > 0 ? (youtube.totalFailed / youtube.totalAvailable) * 100 : 0}%` }"
            />
          </div>
          <span class="text-[10px] font-medium">{{ (youtube.percent || 0).toFixed(0) }}%</span>
        </div>
        <div class="flex items-center justify-between text-[10px] text-gray-500 mt-1">
          <span>{{ (youtube.totalScraped || 0).toLocaleString() }} / {{ (youtube.totalAvailable || 0).toLocaleString() || '?' }} videos</span>
          <span
            v-if="youtube.failureRate && youtube.failureRate > 0"
            :class="youtube.failureRate > 20 ? 'text-red-500 font-bold' : 'text-orange-500'"
          >
            {{ youtube.failureRate.toFixed(1) }}% fail
          </span>
        </div>
      </div>

      <!-- OMDB Stats -->
      <div
        class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-bold truncate pr-2 flex items-center gap-2">
            <div class="i-mdi-database-sync text-green-500" />
            OMDB Enrichment
          </span>
          <div
            class="w-2 h-2 rounded-full bg-green-500"
            title="Active"
          />
        </div>
        <div class="text-xl font-bold flex items-baseline gap-2">
          {{ (omdb.matched || 0).toLocaleString() }}
          <span
            v-if="omdb.failed && omdb.failed > 0"
            class="text-xs font-medium text-orange-500"
            :title="`${omdb.failed} failed matches`"
          >
            +{{ omdb.failed }} failed
          </span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div
              class="h-full bg-green-500 transition-all duration-1000"
              :style="{ width: `${omdb.percent || 0}%` }"
            />
            <div
              v-if="omdb.failed && omdb.failed > 0"
              class="h-full bg-orange-400 transition-all duration-1000"
              :style="{ width: `${omdb.total > 0 ? (omdb.failed / omdb.total) * 100 : 0}%` }"
            />
          </div>
          <span class="text-[10px] font-medium">{{ (omdb.percent || 0).toFixed(0) }}%</span>
        </div>
        <div class="flex items-center justify-between text-[10px] text-gray-500 mt-1">
          <span>{{ (omdb.matched || 0).toLocaleString() }} / {{ (omdb.total || 0).toLocaleString() }} movies</span>
          <span
            v-if="omdb.failureRate && omdb.failureRate > 0"
            :class="omdb.failureRate > 20 ? 'text-red-500 font-bold' : 'text-orange-500'"
          >
            {{ omdb.failureRate.toFixed(1) }}% fail
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface OverallStats {
  archiveOrg: {
    total: number
    scraped: number
    percent: number
    failed?: number
    failureRate?: number
  }
  youtube: {
    totalScraped: number
    totalAvailable: number
    totalFailed: number
    failureRate: number
    percent: number
  }
  omdb: {
    total: number
    matched: number
    percent: number
    failed?: number
    failureRate?: number
  }
}

defineProps<OverallStats>()
</script>
