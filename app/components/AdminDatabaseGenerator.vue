<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-database-export text-blue-500"></div>
      SQLite Database Generation
    </h2>

    <div class="space-y-6">
      <p class="text-theme-textmuted text-sm">
        Generates the main SQLite database (movies.db) used for the frontend. This contains movie
        data, collections, and full-text search indexes. Embeddings are stored separately and
        generated via the Embeddings Generator above.
      </p>

      <!-- Options -->
      <div class="space-y-3">
        <AppInputCheckbox
          v-model="skipJsonGeneration"
          label="Skip individual movie JSON generation"
          :disabled="generating"
        />
        <p class="text-xs text-theme-textmuted px-7 -mt-2">
          Faster if you only need to update the SQLite database and JSON files are already
          up-to-date.
        </p>
      </div>

      <!-- Generate Button -->
      <button
        class="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="generating"
        @click="handleGenerate"
      >
        <div v-if="generating" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-play"></div>
        {{ generating ? 'Generating Database...' : 'Start SQLite Generation' }}
      </button>

      <!-- Success/Error Messages -->
      <div
        v-if="progress.sqlite?.status === 'completed'"
        class="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-sm text-green-500"
      >
        <div class="i-mdi-check-circle"></div>
        {{ progress.sqlite.message }}
      </div>
      <div
        v-if="progress.sqlite?.status === 'error'"
        class="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-sm text-red-500"
      >
        <div class="i-mdi-alert-circle"></div>
        {{ progress.sqlite.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const adminStore = useAdminStore()
const { progress, generatingSqlite: generating } = storeToRefs(adminStore)

const skipJsonGeneration = ref(false)

async function handleGenerate() {
  // Set immediate feedback before API call
  adminStore.updateProgress({
    type: 'sqlite',
    status: 'starting',
    current: 0,
    total: 0,
    message: 'Starting SQLite generation...',
  })

  await adminStore.generateSqlite({
    skipJsonGeneration: skipJsonGeneration.value,
  })
}
</script>
