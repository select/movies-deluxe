<template>
  <section class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold">
        {{ posterResults ? 'Poster Download Results' : 'Scrape Results' }}
      </h2>
      <button
        class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        @click="$emit('clear')"
      >
        Clear
      </button>
    </div>

    <div
      v-if="results"
      class="grid grid-cols-3 gap-4 mb-6"
    >
      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
        <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1">
          Processed
        </div>
        <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
          {{ results.processed }}
        </div>
      </div>
      <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100 dark:border-green-800">
        <div class="text-xs text-green-600 dark:text-green-400 uppercase font-bold tracking-wider mb-1">
          Added
        </div>
        <div class="text-2xl font-bold text-green-700 dark:text-green-300">
          {{ results.added }}
        </div>
      </div>
      <div class="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800">
        <div class="text-xs text-purple-600 dark:text-purple-400 uppercase font-bold tracking-wider mb-1">
          Updated
        </div>
        <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">
          {{ results.updated }}
        </div>
      </div>
    </div>

    <div
      v-if="posterResults"
      class="grid grid-cols-2 gap-4 mb-6"
    >
      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
        <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1">
          Successful
        </div>
        <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
          {{ posterResults.successful }}
        </div>
      </div>
      <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-800">
        <div class="text-xs text-red-600 dark:text-red-400 uppercase font-bold tracking-wider mb-1">
          Failed
        </div>
        <div class="text-2xl font-bold text-red-700 dark:text-red-300">
          {{ posterResults.failed }}
        </div>
      </div>
    </div>

    <div
      v-if="results?.channels && results.channels.length > 0"
      class="mb-6 space-y-3"
    >
      <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500">
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
          <div class="flex gap-3 text-xs text-gray-500">
            <span>Processed: <span class="text-blue-600 dark:text-blue-400 font-medium">{{ chan.processed }}</span></span>
            <span>Added: <span class="text-green-600 dark:text-green-400 font-medium">{{ chan.added }}</span></span>
            <span>Updated: <span class="text-purple-600 dark:text-purple-400 font-medium">{{ chan.updated }}</span></span>
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
      <div class="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-900/10 p-4 rounded-xl text-xs font-mono text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
        <div
          v-for="(err, i) in (results?.errors || posterResults?.errors || [])"
          :key="i"
          class="mb-1"
        >
          • {{ err }}
        </div>
      </div>
    </div>

    <div
      v-if="results?.debug && results.debug.length > 0"
      class="space-y-2 mt-6"
    >
      <h3 class="text-sm font-bold text-blue-500 uppercase tracking-wider">
        Debug Log ({{ results.debug.length }})
      </h3>
      <div class="max-h-60 overflow-y-auto bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl text-xs font-mono text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
        <div
          v-for="(msg, i) in results.debug"
          :key="i"
          class="mb-1"
        >
          {{ msg }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface ScrapeResults {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug?: string[]
  channels?: Array<{ id: string; processed: number; added: number; updated: number }>
}

interface PosterResults {
  processed: number
  successful: number
  failed: number
  errors: string[]
}

defineProps<{
  results: ScrapeResults | null
  posterResults: PosterResults | null
}>()

defineEmits<{
  clear: []
}>()
</script>
