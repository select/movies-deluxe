<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <div class="mb-4">
      <div>
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <div class="i-mdi-broom text-orange-500" />
          Smart Description Cleanup
        </h3>
        <p class="text-sm text-gray-500 mt-1">
          Remove boilerplate and promotional descriptions using pattern detection
        </p>
      </div>
      <button
        class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          class="i-mdi-broom"
          :class="{ 'animate-pulse': loading }"
        />
        {{ loading ? 'Processing...' : 'Clean Descriptions' }}
      </button>
    </div>

    <!-- Results -->
    <div
      v-if="results"
      class="space-y-4"
    >
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div class="text-sm text-gray-500">Total Sources</div>
          <div class="text-xl font-semibold">{{ results.totalSources.toLocaleString() }}</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div class="text-sm text-gray-500">With Descriptions</div>
          <div class="text-xl font-semibold">{{ results.sourcesWithDescriptions.toLocaleString() }}</div>
        </div>
        <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
          <div class="text-sm text-orange-600 dark:text-orange-400">Patterns Found</div>
          <div class="text-xl font-semibold text-orange-700 dark:text-orange-300">{{ results.patterns.length }}</div>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
          <div class="text-sm text-green-600 dark:text-green-400">Sources Processed</div>
          <div class="text-xl font-semibold text-green-700 dark:text-green-300">{{ results.sourcesProcessed.toLocaleString() }}</div>
        </div>
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <div class="text-sm text-blue-600 dark:text-blue-400">Boilerplate Removed</div>
          <div class="text-xl font-semibold text-blue-700 dark:text-blue-300">{{ results.boilerplateRemoved.toLocaleString() }}</div>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
          <div class="text-sm text-purple-600 dark:text-purple-400">Cleanup Rate</div>
          <div class="text-xl font-semibold text-purple-700 dark:text-purple-300">
            {{ ((results.boilerplateRemoved / results.sourcesWithDescriptions) * 100).toFixed(1) }}%
          </div>
        </div>
      </div>

      <!-- Detected Patterns -->
      <div
        v-if="results.patterns.length > 0"
        class="space-y-2"
      >
        <h4 class="font-medium text-gray-900 dark:text-gray-100">
          Boilerplate Patterns Detected & Removed
        </h4>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(pattern, index) in results.patterns"
            :key="index"
            class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ pattern.count.toLocaleString() }} instances removed
              </span>
              <span class="text-xs text-gray-500 font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded">
                {{ pattern.pattern }}
              </span>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              {{ pattern.description }}
            </div>
          </div>
        </div>
      </div>

      <!-- Success Message -->
      <div
        v-if="results.boilerplateRemoved > 0"
        class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-check-circle text-green-500" />
          <div class="text-green-800 dark:text-green-200">
            Successfully removed {{ results.boilerplateRemoved.toLocaleString() }} boilerplate descriptions using {{ results.patterns.length }} detection patterns.
          </div>
        </div>
      </div>

      <!-- No Boilerplate Message -->
      <div
        v-else-if="results.boilerplateRemoved === 0"
        class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-information text-blue-500" />
          <div class="text-blue-800 dark:text-blue-200">
            No boilerplate descriptions detected for removal.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DeduplicationResult } from '~/types/admin'

defineProps<{
  loading: boolean
  results: DeduplicationResult | null
}>()

defineEmits<{
  start: []
}>()
</script>
