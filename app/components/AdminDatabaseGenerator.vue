<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-database-export text-blue-500"></div>
      SQLite Database Generation
    </h2>

    <div class="space-y-6">
      <p class="text-theme-textmuted text-sm">
        Generates the SQLite database used for the frontend. You can select different embedding
        models for semantic search.
      </p>

      <!-- Model Selection -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-theme-textmuted">Embedding Model</label>
        <div class="relative group">
          <select
            v-model="selectedModel"
            class="w-full p-3 bg-theme-surface border border-theme-border rounded-2xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50"
            :disabled="generating"
          >
            <option v-for="model in EMBEDDING_MODELS" :key="model.id" :value="model.id">
              {{ model.name }} ({{ model.dimensions }}D)
            </option>
          </select>
          <div
            class="absolute right-4 top-1/2 -translate-y-1/2 i-mdi-chevron-down text-theme-textmuted pointer-events-none"
          ></div>
        </div>
        <p v-if="selectedModelConfig" class="text-xs text-theme-textmuted italic px-1">
          {{ selectedModelConfig.description }}
        </p>
      </div>

      <!-- Options -->
      <div class="space-y-3">
        <AppInputCheckbox
          :checked="skipJsonGeneration"
          label="Skip individual movie JSON generation"
          :disabled="generating"
          @change="skipJsonGeneration = $event"
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
import { EMBEDDING_MODELS, getModelConfig, getDefaultModel } from '../../config/embedding-models'

const adminStore = useAdminStore()
const { progress, generatingSqlite: generating } = storeToRefs(adminStore)

const selectedModel = ref(getDefaultModel().id)
const skipJsonGeneration = ref(false)

const selectedModelConfig = computed(() => getModelConfig(selectedModel.value))

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
    embeddingModel: selectedModel.value,
    skipJsonGeneration: skipJsonGeneration.value,
  })
}
</script>
