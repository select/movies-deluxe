<template>
  <div class="space-y-6 py-2">
    <!-- Value Display -->
    <div class="flex items-center justify-between">
      <div class="text-xs font-semibold text-theme-textmuted uppercase tracking-wider">
        Year Range
      </div>
      <div class="text-sm font-bold text-theme-primary bg-theme-primary/10 px-2 py-0.5 rounded-lg">
        {{ localMin }} — {{ localMax }}
      </div>
    </div>

    <!-- Sliders -->
    <div class="space-y-4 px-2">
      <!-- Min Year -->
      <div class="space-y-1">
        <div class="flex justify-between text-[10px] text-theme-textmuted">
          <span>From</span>
          <span class="font-bold text-theme-text">{{ localMin }}</span>
        </div>
        <input
          v-model.number="localMin"
          type="range"
          min="1910"
          max="2025"
          step="1"
          class="filter-range-input"
        />
      </div>

      <!-- Max Year -->
      <div class="space-y-1">
        <div class="flex justify-between text-[10px] text-theme-textmuted">
          <span>To</span>
          <span class="font-bold text-theme-text">{{ localMax }}</span>
        </div>
        <input
          v-model.number="localMax"
          type="range"
          min="1910"
          max="2025"
          step="1"
          class="filter-range-input"
        />
      </div>

      <!-- Labels -->
      <div class="flex justify-between text-[10px] text-theme-textmuted font-medium px-1">
        <span>1910</span>
        <span>1970</span>
        <span>2025</span>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="isModified" class="flex justify-end pt-2 border-t border-theme-border/30">
      <button class="text-xs text-theme-primary hover:underline font-medium" @click="resetYears">
        Clear Filter
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)

const localMin = ref(filters.value.minYear || 1910)
const localMax = ref(filters.value.maxYear || 2025)

const isModified = computed(() => {
  return localMin.value !== 1910 || localMax.value !== 2025
})

const resetYears = () => {
  localMin.value = 1910
  localMax.value = 2025
}

// Ensure min <= max
watch(localMin, newVal => {
  if (newVal > localMax.value) {
    localMax.value = newVal
  }
  debouncedUpdate()
})

watch(localMax, newVal => {
  if (newVal < localMin.value) {
    localMin.value = newVal
  }
  debouncedUpdate()
})

// Update store with debounce
const debouncedUpdate = useDebounceFn(() => {
  filters.value.minYear = localMin.value === 1910 ? 0 : localMin.value
  filters.value.maxYear = localMax.value === 2025 ? 0 : localMax.value
}, 300)

// Sync back if store changes externally
watch(
  () => filters.value.minYear,
  newVal => {
    const val = newVal || 1910
    if (val !== localMin.value) localMin.value = val
  }
)
watch(
  () => filters.value.maxYear,
  newVal => {
    const val = newVal || 2025
    if (val !== localMax.value) localMax.value = val
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
