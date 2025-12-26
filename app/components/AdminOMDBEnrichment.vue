<template>
  <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-database-sync text-green-600" />
      OMDB Enrichment
    </h2>

    <div class="space-y-6">
      <AppInputNumber
        v-model="options.limit"
        label="Enrichment limit"
      />

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.onlyUnmatched"
          label="Only unmatched movies"
          @change="options.onlyUnmatched = $event"
        />
        <AppInputSwitch
          :checked="options.forceRetryFailed"
          label="Force retry failed matches"
          @change="options.forceRetryFailed = $event"
        />
      </div>

      <button
        class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl shadow-lg shadow-green-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          v-if="loading"
          class="i-mdi-loading animate-spin"
        />
        <div
          v-else
          class="i-mdi-database-sync"
        />
        {{ loading ? 'Enriching...' : 'Enrich with OMDB' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress && (progress.status === 'in_progress' || progress.status === 'starting')"
        class="mt-4 space-y-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 truncate mr-2">{{ progress.message }}</span>
          <span class="font-mono text-nowrap">{{ progress.current }} / {{ progress.total || '?' }}</span>
        </div>

        <!-- Dual Progress Bar -->
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
          <div
            v-if="progress.total"
            class="h-full bg-green-500 transition-all duration-300"
            :style="{ width: `${((progress.successCurrent || 0) / progress.total) * 100}%` }"
            title="Success"
          />
          <div
            v-if="progress.total"
            class="h-full bg-orange-500 transition-all duration-300"
            :style="{ width: `${((progress.failedCurrent || 0) / progress.total) * 100}%` }"
            title="Failed"
          />
          <div
            v-if="progress.total"
            class="h-full bg-red-600/20 transition-all duration-300"
            :style="{ width: `${((Math.max(0, progress.current - (progress.successCurrent || 0) - (progress.failedCurrent || 0))) / progress.total) * 100}%` }"
          />
        </div>

        <!-- Stats Breakdown -->
        <div class="grid grid-cols-2 gap-2 text-[10px] font-medium">
          <div class="flex items-center gap-1 text-green-600 dark:text-green-400">
            <div class="i-mdi-check-circle" />
            Success: {{ progress.successCurrent || 0 }}
          </div>
          <div class="flex items-center gap-1 text-orange-600 dark:text-orange-400">
            <div class="i-mdi-alert-circle" />
            Failed: {{ progress.failedCurrent || 0 }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface OMDBOptions {
  limit: number
  onlyUnmatched: boolean
  forceRetryFailed: boolean
}

const options = defineModel<OMDBOptions>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const { progress: storeProgress } = storeToRefs(useAdminStore())
const progress = computed(() => storeProgress.value.omdb)
</script>
