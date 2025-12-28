<template>
  <!-- Desktop: Icon-Only Sidebar (hidden on mobile) -->
  <aside
    class="hidden md:block fixed left-4 top-1/2 -translate-y-1/2 z-40 glass shadow-2xl rounded-full w-12 border-white/30 dark:border-gray-700/50"
  >
    <div class="flex flex-col items-center gap-2 py-2">
      <!-- Home -->
      <NuxtLink
        to="/"
        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors relative group"
        title="All Movies"
        :class="{ 'bg-blue-100 dark:bg-blue-900/30': $route.path === '/' }"
      >
        <div class="i-mdi-home text-xl" />
      </NuxtLink>

      <!-- Liked Movies -->
      <NuxtLink
        to="/liked"
        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors relative group"
        title="Liked Movies"
        :class="{ 'bg-red-100 dark:bg-red-900/30': $route.path === '/liked' }"
      >
        <div class="i-mdi-heart text-xl" :class="{ 'text-red-500': $route.path === '/liked' }" />
        <span
          v-if="likedCount > 0"
          class="absolute top-0 -right-1 bg-red-500 text-white text-xs rounded-full size-4 flex items-center justify-center font-medium"
        >
          {{ likedCount > 99 ? '99+' : likedCount }}
        </span>
      </NuxtLink>

      <!-- Filters -->
      <div class="relative group">
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors relative"
          title="Filters"
          :class="{ 'bg-blue-100 dark:bg-blue-900/30': activeFiltersCount > 0 }"
          @click="openFilters"
        >
          <div class="i-mdi-filter-variant text-xl" :class="{ 'text-blue-500': activeFiltersCount > 0 }" />
          <span
            v-if="activeFiltersCount > 0"
            class="absolute top-0 -right-1 bg-blue-500 text-white text-xs rounded-full size-4 flex items-center justify-center font-medium"
          >
            {{ activeFiltersCount > 9 ? '9+' : activeFiltersCount }}
          </span>
        </button>
        
        <!-- Clear Filters Button (appears on hover when filters are active) -->
        <button
          v-if="activeFiltersCount > 0"
          class="absolute -top-1 -right-1 size-5 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300 dark:border-gray-600 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 z-10"
          title="Clear all filters"
          @click.stop="clearFilters"
        >
          <div class="i-mdi-close text-xs text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400" />
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  openFilters: []
}>()

const movieStore = useMovieStore()
const { likedCount, activeFiltersCount } = storeToRefs(movieStore)

const openFilters = () => {
  emit('openFilters')
}

const clearFilters = () => {
  movieStore.resetFilters()
}
</script>
