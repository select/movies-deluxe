<template>
  <div class="p-8 rounded-3xl shadow-lg border border-theme-border bg-theme-surface">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-vector-square text-indigo-500"></div>
      Embeddings Generator
    </h2>

    <div class="space-y-6">
      <p class="text-theme-textmuted text-sm">
        Generate vector embeddings for semantic search. Select one or more models to generate
        embeddings. Existing embeddings are automatically skipped.
      </p>

      <!-- Model Selection -->
      <div class="space-y-3">
        <label class="text-sm font-medium text-theme-textmuted">Select Models</label>
        <div class="space-y-2">
          <div v-for="model in EMBEDDING_MODELS" :key="model.id">
            <AppInputCheckbox
              v-model="selectedModels[model.id]!"
              :label="getModelLabel(model)"
              :disabled="generating"
            />
            <p
              v-if="model.id === 'nomic'"
              class="text-[10px] text-amber-600 dark:text-amber-400 ml-6 -mt-1"
            >
              Requires Ollama server running locally (slow)
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button
            class="text-xs text-indigo-500 hover:text-indigo-600 underline"
            :disabled="generating"
            @click="selectAll"
          >
            Select All
          </button>
          <span class="text-theme-textmuted">|</span>
          <button
            class="text-xs text-theme-textmuted hover:text-theme-text underline"
            :disabled="generating"
            @click="selectNone"
          >
            Clear
          </button>
        </div>
      </div>

      <!-- Options -->
      <div class="space-y-3">
        <AppInputNumber
          v-model="options.limit"
          label="Limit (0 = no limit)"
          :disabled="generating"
        />
        <AppInputCheckbox
          v-model="options.forceRebuild"
          label="Force rebuild (delete existing databases)"
          :disabled="generating"
        />
      </div>

      <!-- Generate Button -->
      <button
        class="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="generating || !Object.values(selectedModels).some(v => v)"
        @click="handleGenerate"
      >
        <div v-if="generating" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-vector-square"></div>
        {{ generating ? 'Generating Embeddings...' : 'Generate Embeddings' }}
      </button>

      <!-- Progress -->
      <div
        v-if="
          progress.embeddings &&
          (progress.embeddings.status === 'in_progress' ||
            progress.embeddings.status === 'starting')
        "
        class="mt-4 space-y-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-theme-textmuted truncate mr-2">{{ progress.embeddings.message }}</span>
          <span class="font-mono text-nowrap">
            {{ progress.embeddings.current }} / {{ progress.embeddings.total || '?' }}
          </span>
        </div>

        <!-- Progress Bar -->
        <div class="h-3 bg-theme-border rounded-full overflow-hidden flex">
          <div
            v-if="progress.embeddings.total"
            class="h-full bg-indigo-500 transition-all duration-300"
            :style="{
              width: `${((progress.embeddings.successCurrent || 0) / progress.embeddings.total) * 100}%`,
            }"
            title="Success"
          ></div>
          <div
            v-if="progress.embeddings.total && progress.embeddings.failedCurrent"
            class="h-full bg-red-500 transition-all duration-300"
            :style="{
              width: `${(progress.embeddings.failedCurrent / progress.embeddings.total) * 100}%`,
            }"
            title="Failed"
          ></div>
        </div>

        <!-- Stats Breakdown -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-medium">
          <div class="flex items-center gap-1 text-green-600 dark:text-green-400">
            <div class="i-mdi-check-circle"></div>
            Success: {{ progress.embeddings.successCurrent || 0 }}
          </div>
          <div class="flex items-center gap-1 text-red-600 dark:text-red-400">
            <div class="i-mdi-alert-circle"></div>
            Failed: {{ progress.embeddings.failedCurrent || 0 }}
          </div>
          <div
            v-if="progress.embeddings.embeddingsPerSecond"
            class="flex items-center gap-1 text-indigo-600 dark:text-indigo-400"
          >
            <div class="i-mdi-speedometer"></div>
            {{ progress.embeddings.embeddingsPerSecond }} emb/s
          </div>
          <div
            v-if="progress.embeddings.estimatedTimeRemaining"
            class="flex items-center gap-1 text-amber-600 dark:text-amber-400"
          >
            <div class="i-mdi-timer-outline"></div>
            ETA: {{ formatETA(progress.embeddings.estimatedTimeRemaining) }}
          </div>
        </div>

        <!-- Last Error (shown under progress) -->
        <div
          v-if="progress.embeddings.lastError"
          class="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400"
        >
          <span class="font-mono">{{ progress.embeddings.lastError }}</span>
        </div>
      </div>

      <!-- Success Message -->
      <div
        v-if="progress.embeddings?.status === 'completed' && lastResults"
        class="p-4 rounded-xl bg-green-500/10 border border-green-500/20"
      >
        <div class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
          <div class="i-mdi-check-circle"></div>
          <span class="font-bold">Generation Complete</span>
        </div>
        <div class="space-y-1 text-xs text-theme-textmuted">
          <div v-for="result in lastResults" :key="result.model" class="flex justify-between">
            <span>{{ getModelName(result.model) }}:</span>
            <span>
              {{ result.processed }} new, {{ result.skipped }} skipped,
              <span v-if="result.failed > 0" class="text-red-500">{{ result.failed }} failed,</span>
              {{ result.totalInDb }} total
            </span>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <div
        v-if="progress.embeddings?.status === 'error'"
        class="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-sm text-red-500"
      >
        <div class="i-mdi-alert-circle"></div>
        {{ progress.embeddings.message }}
      </div>

      <!-- API Errors -->
      <div v-if="apiErrors.length > 0" class="space-y-2">
        <div
          v-for="(error, idx) in apiErrors"
          :key="idx"
          class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400"
        >
          <div class="i-mdi-alert"></div>
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EMBEDDING_MODELS, getModelConfig } from '../../config/embedding-models'

interface ModelResult {
  model: string
  processed: number
  skipped: number
  failed: number
  totalInDb: number
  embeddingsPerSecond: number
  timeElapsed: number
}

const { progress } = storeToRefs(useAdminStore())

// Default to faster models (bge-micro and potion), exclude slow nomic
// Initialize all models to false to avoid undefined values
const selectedModels = ref<Record<string, boolean>>(
  EMBEDDING_MODELS.reduce(
    (acc, model) => {
      acc[model.id] = model.id === 'bge-micro' || model.id === 'potion'
      return acc
    },
    {} as Record<string, boolean>
  )
)
const generating = ref(false)
const lastResults = ref<ModelResult[] | null>(null)
const apiErrors = ref<string[]>([])

const options = reactive({
  limit: 0,
  forceRebuild: false,
})

function getModelLabel(model: { id: string; name: string; dimensions: number }): string {
  return `${model.name} (${model.dimensions}D)`
}

function selectAll() {
  EMBEDDING_MODELS.forEach(m => {
    selectedModels.value[m.id] = true
  })
}

function selectNone() {
  EMBEDDING_MODELS.forEach(m => {
    selectedModels.value[m.id] = false
  })
}

function getModelName(modelId: string): string {
  return getModelConfig(modelId)?.name || modelId
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

async function handleGenerate() {
  generating.value = true
  lastResults.value = null
  apiErrors.value = []

  try {
    const response = await $fetch<{
      success: boolean
      results: ModelResult[]
      errors: string[]
    }>('/api/admin/embeddings/generate', {
      method: 'POST',
      body: {
        models: Object.keys(selectedModels.value).filter(key => selectedModels.value[key]),
        limit: options.limit || undefined,
        forceRebuild: options.forceRebuild,
      },
    })

    lastResults.value = response.results
    if (response.errors.length > 0) {
      apiErrors.value = response.errors
    }
  } catch (error) {
    apiErrors.value = [error instanceof Error ? error.message : 'Failed to generate embeddings']
  } finally {
    generating.value = false
  }
}
</script>
