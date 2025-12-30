<template>
  <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-robot text-purple-600" />
      AI Metadata Extraction
    </h2>

    <div class="space-y-6">
      <AppInputNumber
        v-model="options.limit"
        label="Extraction limit"
      />

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.onlyUnmatched"
          label="Only unmatched movies"
          @change="options.onlyUnmatched = $event"
        />
        <AppInputSwitch
          :checked="options.forceReExtract"
          label="Force re-extract existing AI data"
          @change="options.forceReExtract = $event"
        />
      </div>

      <button
        class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          v-if="loading"
          class="i-mdi-loading animate-spin"
        />
        <div
          v-else
          class="i-mdi-robot"
        />
        {{ loading ? 'Extracting...' : 'Extract with AI' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress.ai && (progress.ai.status === 'in_progress' || progress.ai.status === 'starting')"
        class="mt-4 space-y-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 truncate mr-2">{{ progress.ai.message }}</span>
          <span class="font-mono text-nowrap">{{ progress.ai.current }} / {{ progress.ai.total || '?' }}</span>
        </div>

        <!-- Dual Progress Bar -->
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
          <div
            v-if="progress.ai.total"
            class="h-full bg-purple-500 transition-all duration-300"
            :style="{ width: `${((progress.ai.successCurrent || 0) / progress.ai.total) * 100}%` }"
            title="Success"
          />
          <div
            v-if="progress.ai.total"
            class="h-full bg-orange-500 transition-all duration-300"
            :style="{ width: `${((progress.ai.failedCurrent || 0) / progress.ai.total) * 100}%` }"
            title="Failed"
          />
        </div>

        <!-- Stats Breakdown -->
        <div class="grid grid-cols-2 gap-2 text-[10px] font-medium">
          <div class="flex items-center gap-1 text-purple-600 dark:text-purple-400">
            <div class="i-mdi-check-circle" />
            Success: {{ progress.ai.successCurrent || 0 }}
          </div>
          <div class="flex items-center gap-1 text-orange-600 dark:text-orange-400">
            <div class="i-mdi-alert-circle" />
            Failed: {{ progress.ai.failedCurrent || 0 }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface AIOptions {
  limit: number
  onlyUnmatched: boolean
  forceReExtract: boolean
}

const options = defineModel<AIOptions>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const adminStore = useAdminStore()
const { progress } = storeToRefs(adminStore)
</script>
