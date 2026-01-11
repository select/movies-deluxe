<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-8 space-y-2">
      <div class="i-mdi-loading animate-spin text-2xl text-theme-primary"></div>
      <span class="text-xs text-theme-textmuted">Loading countries...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-xs text-red-500 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
      {{ error }}
    </div>

    <!-- Content -->
    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
        <button
          v-for="country in countries"
          :key="country.name"
          class="px-3 py-1.5 text-xs rounded-full transition-all inline-flex items-center gap-1.5 border"
          :class="[
            filters.countries.includes(country.name)
              ? 'bg-theme-primary text-white border-theme-primary shadow-sm'
              : 'bg-theme-selection text-theme-text border-theme-border/50 hover:border-theme-border hover:bg-theme-border/30',
          ]"
          @click="toggleCountry(country.name)"
        >
          <span>{{ country.name }}</span>
          <span
            class="text-[10px] opacity-70"
            :class="{ 'text-white/80': filters.countries.includes(country.name) }"
          >
            {{ formatCount(country.count) }}
          </span>
        </button>
      </div>

      <div
        v-if="filters.countries.length > 0"
        class="flex justify-end pt-2 border-t border-theme-border/30"
      >
        <button
          class="text-xs text-theme-primary hover:underline font-medium"
          @click="clearCountries"
        >
          Clear ({{ filters.countries.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CountryOption } from '~/types'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)
const { toggleCountry, setCountries } = movieStore

const countries = ref<CountryOption[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)

const fetchCountries = async () => {
  isLoading.value = true
  error.value = null
  try {
    const db = useDatabase()
    const options = await db.getFilterOptions()
    countries.value = options.countries
  } catch (err) {
    error.value = 'Failed to load countries'
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const clearCountries = () => {
  setCountries([])
}

onMounted(() => {
  fetchCountries()
})
</script>
