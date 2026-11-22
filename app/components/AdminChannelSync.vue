<template>
  <section class="bg-theme-surface border border-theme-border rounded-xl p-6 space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold flex items-center gap-2">
          <div class="i-mdi-sync text-blue-500"></div>
          Channel Sync &amp; Diff
        </h2>
        <p class="text-sm text-theme-textmuted mt-1">
          Detect added/removed sources across YouTube channels &amp; Archive.org and probe
          availability reasons.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <select
          v-model="platform"
          class="px-3 py-2 text-sm rounded-lg border border-theme-border bg-theme-background text-theme-text"
          :disabled="syncing"
        >
          <option value="all">All Platforms (YouTube + Archive)</option>
          <option value="youtube">YouTube Only</option>
          <option value="archive">Archive.org Only</option>
        </select>

        <label class="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input v-model="dryRun" type="checkbox" :disabled="syncing" />
          <span>Dry Run</span>
        </label>

        <label class="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input v-model="retryFailed" type="checkbox" :disabled="syncing" />
          <span>Retry Failed</span>
        </label>

        <label class="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input v-model="probeActive" type="checkbox" :disabled="syncing" />
          <span>Probe Active YT</span>
        </label>

        <button
          class="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          :disabled="syncing"
          @click="runSync"
        >
          <div class="i-mdi-sync" :class="{ 'animate-spin': syncing }"></div>
          {{ syncing ? 'Syncing...' : dryRun ? 'Preview Diff' : 'Run Channel Sync' }}
        </button>

        <button
          class="px-3 py-2 text-sm bg-theme-background border border-theme-border rounded-lg hover:bg-theme-selection transition-colors flex items-center gap-1"
          :disabled="loadingHistory"
          @click="loadHistory"
        >
          <div class="i-mdi-refresh" :class="{ 'animate-spin': loadingHistory }"></div>
          Refresh
        </button>
      </div>
    </div>

    <!-- Live SSE Progress -->
    <div
      v-if="
        syncProgress &&
        (syncProgress.status === 'starting' || syncProgress.status === 'in_progress')
      "
      class="space-y-2 p-3 rounded-lg bg-theme-background border border-theme-border"
    >
      <div class="flex items-center justify-between text-xs">
        <span class="text-theme-textmuted truncate mr-2">{{ syncProgress.message }}</span>
        <span v-if="syncProgress.total > 0" class="font-mono text-nowrap">
          {{ syncProgress.current }} / {{ syncProgress.total }}
        </span>
      </div>
      <div class="h-2 bg-theme-border rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          :style="{
            width:
              syncProgress.total > 0
                ? `${Math.min(100, (syncProgress.current / syncProgress.total) * 100)}%`
                : '100%',
          }"
        ></div>
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="syncError"
      class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
    >
      {{ syncError }}
    </div>

    <!-- Latest Sync Result -->
    <div v-if="lastResult" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-theme-textmuted">
          Latest Sync Result
          <span v-if="lastResult.dryRun" class="ml-1 text-amber-500">(Dry Run)</span>
        </h3>
        <div class="flex flex-wrap gap-3 text-xs font-mono">
          <span class="text-green-600 dark:text-green-400"
            >+{{ lastResult.totals.added }} added</span
          >
          <span class="text-red-600 dark:text-red-400"
            >-{{ lastResult.totals.removed }} removed</span
          >
          <span class="text-blue-600 dark:text-blue-400"
            >↺{{ lastResult.totals.restored }} restored</span
          >
          <span class="text-theme-textmuted">{{ lastResult.totals.probed }} probed</span>
          <span class="text-theme-textmuted"
            >{{ lastResult.totals.skippedFailed }} skipped failed</span
          >
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left border-collapse">
          <thead>
            <tr class="border-b border-theme-border text-theme-textmuted">
              <th class="py-2 pr-3">Channel</th>
              <th class="py-2 pr-3">Remote</th>
              <th class="py-2 pr-3">In DB</th>
              <th class="py-2 pr-3">Added</th>
              <th class="py-2 pr-3">Removed</th>
              <th class="py-2 pr-3">Restored</th>
              <th class="py-2 pr-3">Reasons</th>
              <th class="py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ch in lastResult.channels"
              :key="ch.channelId"
              class="border-b border-theme-border/40"
            >
              <td class="py-2 pr-3 font-medium">{{ ch.channelName }}</td>
              <td class="py-2 pr-3 font-mono">{{ ch.totalRemote }}</td>
              <td class="py-2 pr-3 font-mono">{{ ch.existingInDb }}</td>
              <td class="py-2 pr-3 font-mono text-green-600 dark:text-green-400">
                +{{ ch.added }}
              </td>
              <td class="py-2 pr-3 font-mono text-red-600 dark:text-red-400">-{{ ch.removed }}</td>
              <td class="py-2 pr-3 font-mono text-blue-600 dark:text-blue-400">
                {{ ch.restored }}
              </td>
              <td class="py-2 pr-3 font-mono">
                <span
                  v-if="Object.keys(ch.removalReasons).length === 0"
                  class="text-theme-textmuted"
                  >-</span
                >
                <span
                  v-for="(count, reason) in ch.removalReasons"
                  :key="reason"
                  class="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-theme-background border border-theme-border"
                >
                  {{ reason }}: {{ count }}
                </span>
              </td>
              <td class="py-2 text-red-500">{{ ch.error || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Per-Channel Status Counts -->
    <div v-if="history && history.channelCounts.length > 0" class="space-y-3">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-theme-textmuted">
        Source Availability by Channel
      </h3>
      <div class="overflow-x-auto max-h-72 overflow-y-auto">
        <table class="w-full text-xs text-left border-collapse">
          <thead class="sticky top-0 bg-theme-surface">
            <tr class="border-b border-theme-border text-theme-textmuted">
              <th class="py-2 pr-3">Channel</th>
              <th class="py-2 pr-3">Platform</th>
              <th class="py-2 pr-3">Active</th>
              <th class="py-2 pr-3">Unlisted</th>
              <th class="py-2 pr-3">Unavailable</th>
              <th class="py-2 pr-3">Removed</th>
              <th class="py-2 pr-3">Total</th>
              <th class="py-2">Reasons</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ch in history.channelCounts"
              :key="ch.channelId"
              class="border-b border-theme-border/40"
            >
              <td class="py-2 pr-3 font-medium">{{ ch.channelName }}</td>
              <td class="py-2 pr-3 text-theme-textmuted">{{ ch.platform }}</td>
              <td class="py-2 pr-3 font-mono text-green-600 dark:text-green-400">
                {{ ch.active }}
              </td>
              <td class="py-2 pr-3 font-mono text-amber-600 dark:text-amber-400">
                {{ ch.unlisted }}
              </td>
              <td class="py-2 pr-3 font-mono text-red-600 dark:text-red-400">
                {{ ch.unavailable }}
              </td>
              <td class="py-2 pr-3 font-mono text-theme-textmuted">
                {{ ch.removed_from_channel }}
              </td>
              <td class="py-2 pr-3 font-mono font-semibold">{{ ch.total }}</td>
              <td class="py-2 font-mono">
                <span v-if="Object.keys(ch.reasonCounts).length === 0" class="text-theme-textmuted"
                  >-</span
                >
                <span
                  v-for="(count, reason) in ch.reasonCounts"
                  :key="reason"
                  class="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-theme-background border border-theme-border"
                >
                  {{ reason }}: {{ count }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent Sync Events -->
    <div v-if="history && history.events.length > 0" class="space-y-3">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-theme-textmuted">
        Recent Sync Events ({{ history.events.length }})
      </h3>
      <div class="overflow-x-auto max-h-64 overflow-y-auto">
        <table class="w-full text-xs text-left border-collapse">
          <thead class="sticky top-0 bg-theme-surface">
            <tr class="border-b border-theme-border text-theme-textmuted">
              <th class="py-2 pr-3">Time</th>
              <th class="py-2 pr-3">Channel</th>
              <th class="py-2 pr-3">Event</th>
              <th class="py-2 pr-3">Source ID</th>
              <th class="py-2 pr-3">Reason</th>
              <th class="py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in history.events" :key="ev.id" class="border-b border-theme-border/40">
              <td class="py-2 pr-3 whitespace-nowrap text-theme-textmuted">
                {{ new Date(ev.createdAt * 1000).toLocaleString() }}
              </td>
              <td class="py-2 pr-3">{{ ev.channelName || ev.channelId }}</td>
              <td class="py-2 pr-3 font-mono uppercase">{{ ev.eventType }}</td>
              <td class="py-2 pr-3 font-mono">{{ ev.sourceId }}</td>
              <td class="py-2 pr-3 font-mono">{{ ev.reason || '-' }}</td>
              <td class="py-2 text-theme-textmuted truncate max-w-xs" :title="ev.detail || ''">
                {{ ev.detail || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from '#imports'
import { $fetch } from '#build/fetch'
import { useAdminStore } from '~/stores/useAdminStore'
import type { SyncChannelsResponse, SyncHistoryResponse } from '#shared/types/admin'

const adminStore = useAdminStore()
const { progress } = storeToRefs(adminStore)

const platform = ref<'all' | 'youtube' | 'archive'>('all')
const dryRun = ref(true)
const retryFailed = ref(false)
const probeActive = ref(false)

const syncing = ref(false)
const loadingHistory = ref(false)
const syncError = ref<string | null>(null)
const lastResult = ref<SyncChannelsResponse | null>(null)
const history = ref<SyncHistoryResponse | null>(null)

const syncProgress = computed(() => progress.value.channelSync)

const loadHistory = async () => {
  loadingHistory.value = true
  try {
    history.value = await $fetch<SyncHistoryResponse>('/api/admin/scrape/sync-history')
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to load sync history:', e)
  } finally {
    loadingHistory.value = false
  }
}

const runSync = async () => {
  syncing.value = true
  syncError.value = null
  try {
    lastResult.value = await $fetch<SyncChannelsResponse>('/api/admin/scrape/sync-channels', {
      method: 'POST',
      body: {
        platform: platform.value,
        dryRun: dryRun.value,
        retryFailed: retryFailed.value,
        probeActive: probeActive.value,
      },
    })
    await loadHistory()
  } catch (e: unknown) {
    syncError.value = e instanceof Error ? e.message : String(e)
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  loadHistory()
})
</script>
