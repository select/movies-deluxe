<template>
  <header class="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-800 transition-all duration-300 bg-gradient-to-r from-white/80 via-white/70 to-white/80 dark:from-gray-900/80 dark:via-gray-900/70 dark:to-gray-900/80 backdrop-blur-xl">
    <div
      :class="[
        'max-w-none mx-auto px-4 lg:px-[6%] flex items-center justify-between transition-all duration-300',
        windowScrollY > 50 ? 'py-3' : 'py-6'
      ]"
    >
      <div>
        <h1
          :class="[
            'font-bold transition-all duration-300',
            windowScrollY > 50 ? 'text-xl' : 'text-3xl'
          ]"
        >
          Movies Deluxe
        </h1>
        <p
          v-if="windowScrollY <= 50"
          class="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-all duration-300"
        >
          Free legal movie streams from Archive.org and YouTube
        </p>
      </div>

      <!-- Search Bar -->
      <div
        :class="[
          'flex-1 max-w-md mx-8 hidden md:block transition-all duration-300',
          windowScrollY > 50 ? 'scale-95' : 'scale-100'
        ]"
      >
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div class="i-mdi-magnify text-gray-400" />
          </div>
          <input
            :value="filterStore.filters.searchQuery"
            type="text"
            class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-full leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
            placeholder="Search movies, actors, directors..."
            @input="(e) => handleSearchInput((e.target as HTMLInputElement).value)"
          >
          <button
            v-if="filterStore.filters.searchQuery"
            class="absolute inset-y-0 right-0 pr-3 flex items-center"
            @click="filterStore.setSearchQuery('')"
          >
            <div class="i-mdi-close text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
          </button>
        </div>
      </div>

      <!-- Dark Mode Toggle -->
      <button
        :class="[
          'rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-300',
          windowScrollY > 50 ? 'p-1.5' : 'p-2'
        ]"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleDarkMode"
      >
        <div
          v-if="isDark"
          class="i-material-symbols-light-wb-sunny text-xl text-yellow-500"
        />
        <div
          v-else
          class="i-material-symbols-light-dark-mode text-xl"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const filterStore = useFilterStore()
const { y: windowScrollY } = useWindowScroll()

defineProps<{
  isDark: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-dark-mode'): void
}>()

const handleSearchInput = (query: string) => {
  filterStore.setSearchQuery(query)
  if (query && filterStore.filters.sort.field !== 'relevance') {
    filterStore.setSort({ field: 'relevance', direction: 'desc', label: 'Relevance' })
  }
}

const toggleDarkMode = () => {
  emit('toggle-dark-mode')
}
</script>
