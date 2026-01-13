<template>
  <div class="space-y-6 py-2">
    <!-- Value Display -->
    <div class="flex items-center justify-between">
      <div class="text-xs font-semibold text-theme-textmuted uppercase tracking-wider">
        Minimum Rating
      </div>
      <div class="text-lg font-bold text-theme-primary bg-theme-primary/10 px-2 py-0.5 rounded-lg">
        {{ localRating === 0 ? 'All Ratings' : `${localRating.toFixed(1)}+` }}
      </div>
    </div>

    <!-- Slider -->
    <div class="relative px-2">
      <input
        v-model.number="localRating"
        type="range"
        min="0"
        max="10"
        step="0.5"
        class="filter-range-input"
      />

      <!-- Labels -->
      <div class="flex justify-between mt-2 text-[10px] text-theme-textmuted font-medium px-1">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="localRating > 0" class="flex justify-end pt-2 border-t border-theme-border/30">
      <button
        class="text-xs text-theme-primary hover:underline font-medium"
        @click="localRating = 0"
      >
        Clear Filter
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)

const localRating = ref(filters.value.minRating)

// Update store directly with debounce
const debouncedUpdate = useDebounceFn((val: number) => {
  filters.value.minRating = val
}, 300)

watch(localRating, newVal => {
  debouncedUpdate(newVal)
})

// Sync back if store changes externally
watch(
  () => filters.value.minRating,
  newVal => {
    if (newVal !== localRating.value) {
      localRating.value = newVal
    }
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
