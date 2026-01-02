<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
  >
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="i-mdi-alert-decagram text-yellow-600 text-2xl" />
          <h3 class="text-xl font-bold">
            Mark Movie Quality
          </h3>
        </div>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          @click="close"
        >
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        <div>
          <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
            Quality Labels
          </h4>
          <div class="grid grid-cols-2 gap-3">
            <label
              v-for="label in qualityLabelOptions"
              :key="label"
              class="flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              :class="{ 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/50': selectedLabels.includes(label) }"
            >
              <input
                v-model="selectedLabels"
                type="checkbox"
                :value="label"
                class="rounded text-yellow-600 focus:ring-yellow-500"
              >
              <span class="text-sm capitalize">{{ label.replace(/-/g, ' ') }}</span>
            </label>
          </div>
        </div>

        <div>
          <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
            Quality Notes
          </label>
          <textarea
            v-model="notes"
            rows="3"
            placeholder="Additional details about the quality issue..."
            class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition-all"
          />
        </div>

        <div class="flex gap-3 pt-2">
          <button
            class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            @click="close"
          >
            Cancel
          </button>
          <button
            class="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            :disabled="isSaving"
            @click="save"
          >
            <div
              v-if="isSaving"
              class="i-mdi-loading animate-spin"
            />
            <span>{{ isSaving ? 'Saving...' : 'Save Quality' }}</span>
          </button>
        </div>
        
        <button
          v-if="movie.qualityLabels?.length"
          class="w-full mt-2 text-xs text-red-500 hover:text-red-600 underline font-medium"
          @click="clear"
        >
          Clear All Quality Markings
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { QualityLabel, type MovieEntry } from '~/types'

const props = defineProps<{
  modelValue: boolean
  movie: MovieEntry
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

const movieStore = useMovieStore()
const isSaving = ref(false)
const selectedLabels = ref<QualityLabel[]>([])
const notes = ref('')

// Initialize from movie data
watch(() => props.modelValue, (show) => {
  if (show) {
    selectedLabels.value = [...(props.movie.qualityLabels || [])]
    notes.value = props.movie.qualityNotes || ''
  }
})

const qualityLabelOptions = Object.values(QualityLabel)

const close = () => {
  emit('update:modelValue', false)
}

const save = async () => {
  isSaving.value = true
  try {
    const success = await movieStore.markMovieQuality(
      props.movie.imdbId,
      selectedLabels.value,
      notes.value
    )
    if (success) {
      emit('saved')
      close()
    }
  } finally {
    isSaving.value = false
  }
}

const clear = async () => {
  if (!confirm('Clear all quality markings for this movie?')) return
  
  isSaving.value = true
  try {
    const success = await movieStore.clearMovieQuality(props.movie.imdbId)
    if (success) {
      emit('saved')
      close()
    }
  } finally {
    isSaving.value = false
  }
}
</script>
