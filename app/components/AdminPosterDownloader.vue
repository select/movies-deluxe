<template>
  <div
    class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
  >
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-image-multiple text-purple-500" />
      Poster Downloader
    </h2>

    <div class="space-y-6">
      <AppInputNumber
        v-model="options.limit"
        label="Download limit"
      />

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.force"
          label="Force re-download"
          @change="options.force = $event"
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
          class="i-mdi-download"
        />
        {{ loading ? 'Downloading...' : 'Download Posters' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress && progress.status === 'in_progress'"
        class="mt-4 space-y-2"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 truncate mr-2">{{ progress.message }}</span>
          <span class="font-mono text-nowrap">{{ progress.current }} / {{ progress.total }}</span>
        </div>
        <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 transition-all duration-300"
            :style="{ width: `${(progress.current / progress.total) * 100}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PosterOptions } from '~/types/admin'

const options = defineModel<PosterOptions>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const adminStore = useAdminStore()
const progress = computed(() => adminStore.progress.posters)
</script>
