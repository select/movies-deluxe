<template>
  <div class="bg-theme-surface rounded-3xl border border-theme-border p-6">
    <div class="mb-4">
      <div>
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <div class="i-mdi-folder-sync text-purple-500" />
          Collection Cleanup
        </h3>
        <p class="text-sm text-theme-textmuted mt-1">
          Remove non-existent movies and update outdated IDs in collections
        </p>
      </div>
      <button
        class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-3"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          class="i-mdi-folder-sync"
          :class="{ 'animate-pulse': loading }"
        />
        {{ loading ? 'Cleaning...' : 'Clean Collections' }}
      </button>
    </div>

    <!-- Results -->
    <div
      v-if="results"
      class="space-y-4"
    >
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-theme-background rounded-lg p-3">
          <div class="text-sm text-theme-textmuted">Collections Processed</div>
          <div class="text-xl font-semibold">{{ results.stats.collectionsProcessed }}</div>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
          <div class="text-sm text-purple-600 dark:text-purple-400">Collections Modified</div>
          <div class="text-xl font-semibold text-purple-700 dark:text-purple-300">{{ results.stats.collectionsModified }}</div>
        </div>
        <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          <div class="text-sm text-red-600 dark:text-red-400">Movies Removed</div>
          <div class="text-xl font-semibold text-red-700 dark:text-red-300">{{ results.stats.moviesRemoved }}</div>
        </div>
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <div class="text-sm text-blue-600 dark:text-blue-400">IDs Updated</div>
          <div class="text-xl font-semibold text-blue-700 dark:text-blue-300">{{ results.stats.moviesUpdated }}</div>
        </div>
      </div>

      <!-- Details -->
      <div
        v-if="results.details.length > 0"
        class="space-y-2"
      >
        <h4 class="font-medium text-theme-text">
          Modified Collections
        </h4>
        <div class="space-y-2 max-h-96 overflow-y-auto">
          <div
            v-for="(detail, index) in results.details"
            :key="index"
            class="bg-theme-background rounded-lg p-3"
          >
            <div class="font-medium text-theme-text mb-2">
              {{ detail.collectionName }}
            </div>
            <div
              v-if="detail.removedMovies.length > 0"
              class="text-sm text-red-600 dark:text-red-400 mb-1"
            >
              Removed {{ detail.removedMovies.length }} movie(s): {{ detail.removedMovies.slice(0, 3).join(', ') }}{{ detail.removedMovies.length > 3 ? '...' : '' }}
            </div>
            <div
              v-if="detail.updatedMovies.length > 0"
              class="text-sm text-blue-600 dark:text-blue-400"
            >
              Updated {{ detail.updatedMovies.length }} ID(s)
            </div>
          </div>
        </div>
      </div>

      <!-- Success Message -->
      <div
        v-if="results.success && results.stats.collectionsModified > 0"
        class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-check-circle text-green-500" />
          <div class="text-green-800 dark:text-green-200">
            Successfully cleaned {{ results.stats.collectionsModified }} collection(s). Removed {{ results.stats.moviesRemoved }} non-existent movie(s) and updated {{ results.stats.moviesUpdated }} ID(s).
          </div>
        </div>
      </div>

      <!-- No Changes Message -->
      <div
        v-else-if="results.success && results.stats.collectionsModified === 0"
        class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-information text-blue-500" />
          <div class="text-blue-800 dark:text-blue-200">
            All collections are clean. No changes needed.
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <div
        v-else-if="!results.success"
        class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
      >
        <div class="flex items-center gap-2">
          <div class="i-mdi-alert-circle text-red-500" />
          <div class="text-red-800 dark:text-red-200">
            Collection cleanup failed. Please check the console for details.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CollectionCleanupResult } from '~/types/admin'

defineProps<{
  loading: boolean
  results: CollectionCleanupResult | null
}>()

defineEmits<{
  start: []
}>()
</script>
