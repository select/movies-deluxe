<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <div class="i-mdi-content-duplicate text-orange-500" />
          Description Deduplication
        </h3>
        <p class="text-sm text-gray-500 mt-1">
          Remove duplicate descriptions from movie sources
        </p>
      </div>
      <button
        class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          :class="['i-mdi-content-duplicate', loading ? 'animate-pulse' : '']"
        />
        {{ loading ? 'Processing...' : 'Remove Duplicates' }}
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
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div class="text-sm text-gray-500">Duplicates Found</div>
          <div class="text-xl font-semibold">{{ results.duplicatesFound.toLocaleString() }}</div>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
          <div class="text-sm text-green-600 dark:text-green-400">Sources Processed</div>
          <div class="text-xl font-semibold text-green-700 dark:text-green-300">{{ results.sourcesProcessed.toLocaleString() }}</div>
        </div>
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <div class="text-sm text-blue-600 dark:text-blue-400">Descriptions Removed</div>
          <div class="text-xl font-semibold text-blue-700 dark:text-blue-300">{{ results.descriptionsRemoved.toLocaleString() }}</div>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
          <div class="text-sm text-purple-600 dark:text-purple-400">Space Saved</div>
          <div class="text-xl font-semibold text-purple-700 dark:text-purple-300">
            {{ ((results.descriptionsRemoved / results.sourcesWithDescriptions) * 100).toFixed(1) }}%
          </div>
        </div>
      </div>

      <!-- Top Duplicates -->
      <div
        v-if="results.topDuplicates.length > 0"
        class="space-y-2"
      >
        <h4 class="font-medium text-gray-900 dark:text-gray-100">
          Most Common Duplicates Removed
        </h4>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(duplicate, index) in results.topDuplicates"
            :key="index"
            class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ duplicate.count.toLocaleString() }} occurrences
              </span>
              <span class="text-xs text-gray-500">
                {{ duplicate.description.length }} characters
              </span>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-800 rounded p-2 border">
              {{ duplicate.preview }}
            </div>
          </div>
        </div>
      </div>

      <!-- Success Message -->
      <div
        v-if="results.descriptionsRemoved > 0"
        class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-check-circle text-green-500" />
          <div class="text-green-800 dark:text-green-200">
            Successfully removed {{ results.descriptionsRemoved.toLocaleString() }} duplicate descriptions from {{ results.sourcesProcessed.toLocaleString() }} sources.
          </div>
        </div>
      </div>

      <!-- No Duplicates Message -->
      <div
        v-else-if="results.descriptionsRemoved === 0"
        class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-information text-blue-500" />
          <div class="text-blue-800 dark:text-blue-200">
            No duplicate descriptions found to remove.
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