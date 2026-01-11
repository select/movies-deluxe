<template>
  <div class="space-y-4">
    <AppSortButtonGroup
      :current-sort="filters.sort"
      :show-relevance="!!filters.searchQuery"
      @select="setSort"
    />

    <div v-if="!isDefaultSort" class="flex justify-end pt-2 border-t border-theme-border/30">
      <button class="text-xs text-theme-primary hover:underline font-medium" @click="resetSort">
        Reset to Default
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)
const { setSort } = movieStore

const isDefaultSort = computed(() => {
  return filters.value.sort.field === 'year' && filters.value.sort.direction === 'desc'
})

const resetSort = () => {
  setSort({ field: 'year', direction: 'desc' })
}
</script>
