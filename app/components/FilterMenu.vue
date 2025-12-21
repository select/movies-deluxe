<template>
  <div>
    <!-- Overlay (visible when menu is open) -->
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
      @click="emit('close')"
    />

    <!-- Filter Menu Panel (slides from top) -->
    <div
      :class="[
        'fixed z-40',
        'transition-all duration-300 ease-in-out',
        'bg-white dark:bg-gray-800',
        'border-b border-gray-200 dark:border-gray-700',
        'shadow-lg',
        'left-0 right-0',
        'overflow-hidden',
        isOpen ? 'top-0' : '-top-full',
      ]"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <div class="i-mdi-filter-variant text-xl" />
          Filters
        </h2>
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close filters"
          @click="emit('close')"
        >
          <div class="i-mdi-close text-xl" />
        </button>
      </div>

      <!-- Filter Content -->
      <div class="overflow-y-auto max-h-[60vh] p-4">
        <div class="max-w-7xl mx-auto space-y-4">
          <!-- Row 1: Sort, Rating, Year, Votes -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <!-- Sort Controls -->
            <FilterSection
              title="Sort By"
              icon="i-mdi-sort"
            >
              <div class="space-y-2">
                <AppInputRadio
                  v-for="option in sortOptions"
                  :key="`${option.field}-${option.direction}`"
                  :checked="currentSort.field === option.field && currentSort.direction === option.direction"
                  :label="option.label"
                  name="sort"
                  :value="option"
                  @change="handleSortChange(option)"
                />
              </div>
            </FilterSection>

            <!-- Rating Filter -->
            <FilterSection
              title="Rating"
              icon="i-mdi-star"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">Min:</span>
                  <span class="font-medium">{{ filterStore.filters.minRating.toFixed(1) }}+</span>
                </div>
                <input
                  :value="filterStore.filters.minRating"
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  @input="(e) => filterStore.setMinRating(Number((e.target as HTMLInputElement).value))"
                >
                <div class="flex justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            </FilterSection>

            <!-- Year Filter -->
            <FilterSection
              title="Year"
              icon="i-mdi-calendar"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">From:</span>
                  <span class="font-medium">{{ filterStore.filters.minYear || '1910' }}+</span>
                </div>
                <input
                  :value="filterStore.filters.minYear"
                  type="range"
                  min="1910"
                  max="2025"
                  step="1"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  @input="(e) => filterStore.setMinYear(Number((e.target as HTMLInputElement).value))"
                >
                <div class="flex justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>1910</span>
                  <span>1970</span>
                  <span>2025</span>
                </div>
              </div>
            </FilterSection>

            <!-- Votes Filter -->
            <FilterSection
              title="Votes"
              icon="i-mdi-account-group"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">Min:</span>
                  <span class="font-medium">{{ filterStore.filters.minVotes.toLocaleString() }}+</span>
                </div>
                <input
                  :value="filterStore.filters.minVotes"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  @input="(e) => filterStore.setMinVotes(Number((e.target as HTMLInputElement).value))"
                >
                <p class="text-xs text-gray-500 dark:text-gray-500">
                  IMDB votes
                </p>
              </div>
            </FilterSection>
          </div>

          <!-- Row 2: Source and Genres+Countries -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Source Filter -->
            <FilterSection
              title="Source"
              icon="i-mdi-source-branch"
            >
              <div class="space-y-3">
                <!-- Archive.org -->
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    :checked="filterStore.filters.sources.includes('archive.org')"
                    type="checkbox"
                    class="rounded"
                    @change="filterStore.toggleSource('archive.org')"
                  >
                  <span class="text-sm">Archive.org</span>
                </label>

                <!-- YouTube Channels -->
                <div class="pl-4 space-y-2 border-l-2 border-gray-300 dark:border-gray-600">
                  <p class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-2">
                    YouTube Channels
                  </p>
                  <label
                    v-for="channel in youtubeChannels"
                    :key="channel"
                    class="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      :checked="filterStore.filters.sources.includes(channel)"
                      type="checkbox"
                      class="rounded"
                      @change="filterStore.toggleSource(channel)"
                    >
                    <span class="text-sm">{{ channel }}</span>
                  </label>
                </div>
              </div>
            </FilterSection>

            <!-- Genres and Countries Combined -->
            <div class="space-y-4">
              <!-- Genre Filter -->
              <FilterSection
                title="Genres"
                icon="i-mdi-movie-filter"
              >
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="genre in availableGenres"
                    :key="genre"
                    :class="[
                      'px-3 py-1.5 text-sm rounded-full transition-colors',
                      filterStore.filters.genres.includes(genre)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                    @click="filterStore.toggleGenre(genre)"
                  >
                    {{ genre }}
                  </button>
                </div>
              </FilterSection>

              <!-- Country Filter -->
              <FilterSection
                title="Countries"
                icon="i-mdi-earth"
              >
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="country in availableCountries"
                    :key="country"
                    :class="[
                      'px-3 py-1.5 text-sm rounded-full transition-colors',
                      filterStore.filters.countries.includes(country)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                    @click="filterStore.toggleCountry(country)"
                  >
                    {{ country }}
                  </button>
                </div>
              </FilterSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFilterStore } from '@/stores/useFilterStore'
import { SORT_OPTIONS, type SortOption } from '@/utils/movieSort'

interface Props {
  isOpen: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Use filter store
const filterStore = useFilterStore()

// Get sort options from utils
const sortOptions = SORT_OPTIONS

// YouTube channels (from actual data)
const youtubeChannels = [
  'FilmRise Movies',
  'Mosfilm',
  'Movie Central',
  'Moviedome',
  'Netzkino',
  'Popcornflix',
  'Timeless Classic Movies',
]

// Available genres (from dataset analysis)
const availableGenres = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Film-Noir',
  'History',
  'Horror',
  'Music',
  'Musical',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Short',
  'Thriller',
  'War',
  'Western',
]

// Available countries (from dataset analysis)
const availableCountries = [
  'Australia',
  'Belgium',
  'Canada',
  'Denmark',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'India',
  'Italy',
  'Japan',
  'Netherlands',
  'Portugal',
  'Romania',
  'Russia',
  'South Africa',
  'Soviet Union',
  'Spain',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'USA',
  'Vietnam',
]

// Safe access to current sort (handles SSR and undefined cases)
const currentSort = computed(() => filterStore.filters.sort || SORT_OPTIONS[0])

// Handle sort change
const handleSortChange = (option: SortOption) => {
  filterStore.setSort(option)
}
</script>
