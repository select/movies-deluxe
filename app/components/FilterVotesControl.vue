<template>
  <div class="space-y-6 py-2">
    <!-- Value Display -->
    <div class="flex items-center justify-between">
      <div class="text-xs font-semibold text-theme-textmuted uppercase tracking-wider">
        Votes Range
      </div>
      <div class="text-sm font-bold text-theme-primary bg-theme-primary/10 px-2 py-0.5 rounded-lg">
        {{ formatCount(localMinVal) }} — {{ localMaxIdx === 9 ? 'Any' : formatCount(localMaxVal) }}
      </div>
    </div>

    <!-- Sliders -->
    <div class="space-y-4 px-2">
      <!-- Min Votes -->
      <div class="space-y-1">
        <div class="flex justify-between text-[10px] text-theme-textmuted">
          <span>Min</span>
          <span class="font-bold text-theme-text">{{ formatCount(localMinVal) }}</span>
        </div>
        <input
          v-model.number="localMinIdx"
          type="range"
          min="0"
          max="9"
          step="1"
          class="filter-range-input"
        />
      </div>

      <!-- Max Votes -->
      <div class="space-y-1">
        <div class="flex justify-between text-[10px] text-theme-textmuted">
          <span>Max</span>
          <span class="font-bold text-theme-text">
            {{ localMaxIdx === 9 ? 'Any' : formatCount(localMaxVal) }}
          </span>
        </div>
        <input
          v-model.number="localMaxIdx"
          type="range"
          min="0"
          max="9"
          step="1"
          class="filter-range-input"
        />
      </div>

      <!-- Labels -->
      <div class="flex justify-between text-[8px] text-theme-textmuted font-medium px-0 opacity-70">
        <span v-for="label in scaleLabels" :key="label" class="w-8 text-center">{{ label }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="isModified" class="flex justify-end pt-2 border-t border-theme-border/30">
      <button class="text-xs text-theme-primary hover:underline font-medium" @click="resetVotes">
        Clear Filter
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const movieStore = useMovieStore()
const { filters: storeFilters } = storeToRefs(movieStore)

const injectedFilters = inject(FILTER_STATE_KEY, null)
const filters = injectedFilters || storeFilters

const votesScale = [0, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000]
const scaleLabels = ['0', '1K', '5K', '50K', '500K', '1M+']

const getIdx = (val: number) => {
  const idx = votesScale.findIndex(v => v >= val)
  return idx === -1 ? 9 : idx
}

const localMinIdx = ref(getIdx(filters.value.minVotes))
const localMaxIdx = ref(filters.value.maxVotes ? getIdx(filters.value.maxVotes) : 9)

const localMinVal = computed(() => votesScale[localMinIdx.value]!)
const localMaxVal = computed(() => votesScale[localMaxIdx.value]!)

const isModified = computed(() => {
  return localMinIdx.value !== 0 || localMaxIdx.value !== 9
})

const resetVotes = () => {
  localMinIdx.value = 0
  localMaxIdx.value = 9
}

// Ensure min <= max
watch(localMinIdx, newVal => {
  if (newVal > localMaxIdx.value) {
    localMaxIdx.value = newVal
  }
  debouncedUpdate()
})

watch(localMaxIdx, newVal => {
  if (newVal < localMinIdx.value) {
    localMinIdx.value = newVal
  }
  debouncedUpdate()
})

// Update store with debounce
const debouncedUpdate = useDebounceFn(() => {
  filters.value.minVotes = localMinVal.value
  filters.value.maxVotes = localMaxIdx.value === 9 ? 0 : localMaxVal.value
}, 300)

// Sync back if store changes externally
watch(
  () => filters.value.minVotes,
  newVal => {
    const idx = getIdx(newVal)
    if (idx !== localMinIdx.value) localMinIdx.value = idx
  }
)
watch(
  () => filters.value.maxVotes,
  newVal => {
    const idx = newVal ? getIdx(newVal) : 9
    if (idx !== localMaxIdx.value) localMaxIdx.value = idx
  }
)
</script>

<style scoped>
.filter-range-input {
  @apply w-full h-1.5 bg-theme-border/50 rounded-full appearance-none cursor-pointer outline-none transition-colors;
}

.filter-range-input::-webkit-slider-runnable-track {
  @apply h-1.5 bg-theme-border/50 rounded-full;
}

.filter-range-input::-webkit-slider-thumb {
  @apply appearance-none w-4 h-4 rounded-full bg-theme-primary border-2 border-theme-surface shadow-md -mt-1.25 transition-transform active:scale-125;
}

.filter-range-input::-moz-range-track {
  @apply h-1.5 bg-theme-border/50 rounded-full;
}

.filter-range-input::-moz-range-thumb {
  @apply w-4 h-4 rounded-full bg-theme-primary border-2 border-theme-surface shadow-md transition-transform active:scale-125;
}
</style>
