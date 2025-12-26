<template>
  <div class="relative">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <div class="i-mdi-magnify text-gray-400" />
    </div>
    <input
      :value="filters.searchQuery"
      type="text"
      class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-full leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
      :placeholder="placeholder"
      @input="handleInput"
    >
    <button
      v-if="filters.searchQuery"
      class="absolute inset-y-0 right-0 pr-3 flex items-center"
      @click="setSearchQuery('')"
    >
      <div class="i-mdi-close text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
    </button>
  </div>
</template>

<script setup lang="ts">
const { filters } = storeToRefs(useFilterStore())
const { setSearchQuery, setSort } = useFilterStore()

withDefaults(defineProps<{
  placeholder?: string
}>(), {
  placeholder: 'Search movies, actors, directors...'
})

const handleInput = (e: Event) => {
  const query = (e.target as HTMLInputElement).value
  setSearchQuery(query)
  
  // If searching, switch to relevance sort if not already
  if (query && filters.value.sort.field !== 'relevance') {
    setSort({ field: 'relevance', direction: 'desc', label: 'Relevance' })
  }
}
</script>
