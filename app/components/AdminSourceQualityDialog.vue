<template>
  <div
    v-if="modelValue && source"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
  >
    <div
      class="bg-theme-surface rounded-2xl w-full max-w-lg shadow-2xl border border-theme-border overflow-hidden"
    >
      <div class="p-6 border-b border-theme-border flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="i-mdi-alert-decagram text-yellow-600 text-2xl" />
          <h3 class="text-xl font-bold">Mark Source Quality</h3>
        </div>
        <button class="p-2 hover:bg-theme-selection rounded-full transition-colors" @click="close">
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        <div class="p-3 bg-theme-background/50 rounded-lg border border-theme-border">
          <div class="flex items-center gap-2 mb-1">
            <div
              :class="
                source.type === 'youtube'
                  ? 'i-mdi-youtube text-red-600'
                  : 'i-mdi-bank text-blue-600'
              "
              class="text-lg"
            />
            <span class="font-medium text-theme-text">{{ source.type }}</span>
          </div>
          <p class="text-xs text-theme-textmuted line-clamp-2">
            {{ source.title }}
          </p>
        </div>

        <div>
          <h4 class="text-sm font-bold text-theme-text mb-3 uppercase tracking-wider">
            Quality Marks
          </h4>
          <div class="grid grid-cols-2 gap-3">
            <label
              v-for="mark in qualityMarkOptions"
              :key="mark"
              class="flex items-center gap-2 p-2 rounded-lg border border-theme-border hover:bg-theme-selection cursor-pointer transition-colors"
              :class="{
                'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/50':
                  selectedMarks.includes(mark),
              }"
            >
              <input
                v-model="selectedMarks"
                type="checkbox"
                :value="mark"
                class="rounded text-yellow-600 focus:ring-yellow-500"
              />
              <span class="text-sm capitalize">{{ mark.replace(/-/g, ' ') }}</span>
            </label>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button
            class="flex-1 px-4 py-2 border border-theme-border rounded-lg font-bold hover:bg-theme-selection transition-colors"
            @click="close"
          >
            Cancel
          </button>
          <button
            class="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            :disabled="isSaving"
            @click="save"
          >
            <div v-if="isSaving" class="i-mdi-loading animate-spin" />
            <span>{{ isSaving ? 'Saving...' : 'Save Quality' }}</span>
          </button>
        </div>

        <button
          v-if="source.qualityMarks?.length"
          class="w-full mt-2 text-xs text-red-500 hover:text-red-600 underline font-medium"
          @click="clear"
        >
          Clear All Quality Marks
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SourceQualityMark, type MovieEntry, type MovieSource } from '~/types'

const props = defineProps<{
  modelValue: boolean
  movie: MovieEntry
  source: MovieSource | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const isSaving = ref(false)
const selectedMarks = ref<string[]>([])

// Initialize from source data
watch(
  () => props.modelValue,
  show => {
    if (show && props.source) {
      selectedMarks.value = [...(props.source.qualityMarks || [])]
    }
  }
)

const qualityMarkOptions = Object.values(SourceQualityMark)

const close = () => {
  emit('update:modelValue', false)
}

const save = async () => {
  if (!props.source) return

  isSaving.value = true
  try {
    const res = await $fetch<{ success: boolean }>('/api/admin/movie/update-source-quality', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        sourceId: props.source.id,
        qualityMarks: selectedMarks.value,
      },
    })

    if (res.success) {
      emit('saved')
      close()
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to update source quality:', err)
  } finally {
    isSaving.value = false
  }
}

const clear = async () => {
  if (!confirm('Clear all quality marks for this source?')) return

  selectedMarks.value = []
  await save()
}
</script>
