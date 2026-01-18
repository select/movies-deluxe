<template>
  <div class="space-y-4">
    <AppSortButtonGroup
      :current-sort="filters.sort"
      :show-relevance="!!filters.searchQuery"
      @select="filters.sort = $event"
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
const { filters: storeFilters } = storeToRefs(movieStore)

const injectedFilters = inject(FILTER_STATE_KEY, null)
const filters = injectedFilters || storeFilters

const isDefaultSort = computed(() => {
  return filters.value.sort.field === 'year' && filters.value.sort.direction === 'desc'
})

const resetSort = () => {
  filters.value.sort = { field: 'year', direction: 'desc' }
}
</script>
