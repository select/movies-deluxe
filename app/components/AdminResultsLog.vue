<template>
  <section class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold">
        {{ posterResults ? 'Poster Download Results' : 'Scrape Results' }}
      </h2>
      <button
        class="text-sm text-theme-textmuted hover:text-gray-700 dark:hover:text-gray-300"
        @click="$emit('clear')"
      >
        Clear
      </button>
    </div>

    <div v-if="results" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div
        class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800"
      >
        <div
          class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1"
        >
          Processed
        </div>
        <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
          {{ results.processed }}
        </div>
      </div>
      <div
        class="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100 dark:border-green-800"
      >
        <div
          class="text-xs text-green-600 dark:text-green-400 uppercase font-bold tracking-wider mb-1"
        >
          Success
        </div>
        <div class="text-2xl font-bold text-green-700 dark:text-green-300">
          {{ results.added + results.updated }}
        </div>
        <div class="text-[10px] text-green-600/70 dark:text-green-400/70 mt-1">
          {{ results.added }} added, {{ results.updated }} updated
        </div>
      </div>
      <div
        class="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange-100 dark:border-orange-800"
      >
        <div
          class="text-xs text-orange-600 dark:text-orange-400 uppercase font-bold tracking-wider mb-1"
        >
          Failed
        </div>
        <div class="text-2xl font-bold text-orange-700 dark:text-orange-300">
          {{ results.failed || 0 }}
        </div>
      </div>
      <div
        class="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-2xl border border-gray-100 dark:border-gray-800"
      >
        <div class="text-xs text-theme-textmuted uppercase font-bold tracking-wider mb-1">
          Skipped
        </div>
        <div class="text-2xl font-bold text-theme-text">
          {{ results.skipped || 0 }}
        </div>
      </div>
    </div>

    <!-- Failure Reasons Breakdown -->
    <div
      v-if="results?.failureReasons && Object.keys(results.failureReasons).length > 0"
      class="mb-6 p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-900/30"
    >
      <h3
        class="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-3"
      >
        Failure Reasons
      </h3>
      <div class="flex flex-wrap gap-4">
        <div
          v-for="(count, reason) in results.failureReasons"
          :key="reason"
          class="flex items-center gap-2"
        >
          <span class="text-xs font-medium text-theme-text capitalize"
            >{{ reason.replace('_', ' ') }}:</span
          >
          <span class="text-sm font-bold text-orange-600 dark:text-orange-400">{{ count }}</span>
        </div>
      </div>
    </div>

    <div v-if="posterResults" class="grid grid-cols-2 gap-4 mb-6">
      <div
        class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800"
      >
        <div
          class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1"
        >
          Successful
        </div>
        <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
          {{ posterResults.successful }}
        </div>
      </div>
      <div
        class="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-800"
      >
        <div class="text-xs text-red-600 dark:text-red-400 uppercase font-bold tracking-wider mb-1">
          Failed
        </div>
        <div class="text-2xl font-bold text-red-700 dark:text-red-300">
          {{ posterResults.failed }}
        </div>
      </div>
    </div>

    <div v-if="results?.channels && results.channels.length > 0" class="mb-6 space-y-3">
      <h3 class="text-sm font-bold uppercase tracking-wider text-theme-textmuted">
        Per-Channel Progress
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="chan in results.channels"
          :key="chan.id"
          class="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <div class="font-bold text-sm mb-1 truncate">
            {{ chan.id }}
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-theme-textmuted">
            <span
              >Processed:
              <span class="text-blue-600 dark:text-blue-400 font-medium">{{
                chan.processed
              }}</span></span
            >
            <span
              >Success:
              <span class="text-green-600 dark:text-green-400 font-medium">{{
                chan.added + chan.updated
              }}</span></span
            >
            <span v-if="chan.failed"
              >Failed:
              <span class="text-orange-600 dark:text-orange-400 font-medium">{{
                chan.failed
              }}</span></span
            >
            <span v-if="chan.skipped"
              >Skipped:
              <span class="text-theme-textmuted font-medium">{{ chan.skipped }}</span></span
            >
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="(results?.errors.length || 0) > 0 || (posterResults?.errors.length || 0) > 0"
      class="space-y-2"
    >
      <h3 class="text-sm font-bold text-red-500 uppercase tracking-wider">
        Errors ({{ (results?.errors.length || 0) + (posterResults?.errors.length || 0) }})
      </h3>
      <div
        class="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-900/10 p-4 rounded-xl text-xs font-mono text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30"
      >
        <div
          v-for="(err, i) in results?.errors || posterResults?.errors || []"
          :key="i"
          class="mb-1"
        >
          • {{ err }}
        </div>
      </div>
    </div>

    <div v-if="results?.debug && results.debug.length > 0" class="space-y-2 mt-6">
      <h3 class="text-sm font-bold text-blue-500 uppercase tracking-wider">
        Debug Log ({{ results.debug.length }})
      </h3>
      <div
        class="max-h-60 overflow-y-auto bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl text-xs font-mono text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30"
      >
        <div v-for="(msg, i) in results.debug" :key="i" class="mb-1">
          {{ msg }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ScrapeResults, PosterResults } from '~/types/admin'

defineProps<{
  results: ScrapeResults | null
  posterResults: PosterResults | null
}>()

defineEmits<{
  clear: []
}>()
</script>
