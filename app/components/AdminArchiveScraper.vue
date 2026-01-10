<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-archive text-amber-500"></div>
      Archive.org Scraper
    </h2>

    <div class="space-y-6">
      <p class="text-theme-textmuted text-sm">
        Scrapes all available movies from Archive.org's "Feature Films" collection. Always fetches
        500 rows per page to minimize API calls and scrapes all pages until completion.
      </p>

      <button
        class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div v-if="loading" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-play"></div>
        {{ loading ? 'Scraping in progress...' : 'Start Archive.org Scrape' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress.archive && progress.archive.status === 'in_progress'"
        class="mt-4 space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{ progress.archive.message }}</span>
          <span class="font-mono text-nowrap"
            >{{ progress.archive.current }} / {{ progress.archive.total }}</span
          >
        </div>
        <div class="h-2 bg-theme-border rounded-full overflow-hidden">
          <div
            class="h-full bg-amber-500 transition-all duration-300"
            :style="{ width: `${(progress.archive.current / progress.archive.total) * 100}%` }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Options are passed from parent but not used in this simplified UI
defineModel<{ [key: string]: unknown }>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const { progress } = storeToRefs(useAdminStore())
</script>
