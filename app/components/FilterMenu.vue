<template>
  <div>
    <!-- Overlay (visible when menu is open) -->
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity"
      @click="emit('close')"
    />

    <!-- Filter Menu Panel (mobile: bottom sheet, desktop: left sidebar) -->
    <div
      ref="filterMenuRef"
      :class="[
        'fixed z-50',
        'transition-all duration-300 ease-in-out',
        'bg-white dark:bg-gray-800',
        'shadow-lg',
        'overflow-hidden flex flex-col',
        // Mobile: Bottom sheet (< md breakpoint)
        'bottom-0 left-0 right-0 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 max-h-[90vh]',
        // Desktop: Left sidebar (>= md breakpoint)
        'md:top-0 md:left-0 md:bottom-0 md:right-auto md:h-full md:w-full md:max-w-xl md:rounded-none md:border-t-0 md:border-r md:border-gray-200 md:dark:border-gray-700 md:max-h-full',
        // Animation: translateY for mobile, translateX for desktop
        isOpen
          ? 'translate-y-0 md:translate-x-0'
          : 'translate-y-full md:translate-y-0 md:-translate-x-full',
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
      <div class="overflow-y-auto scrollbar-thin flex-1 md:h-[calc(100vh-4rem)] p-4">
        <div class="max-w-7xl mx-auto space-y-4">
          <!-- Sort Section (Top) -->
          <div class="pb-4 border-b-2 border-gray-300 dark:border-gray-600">
            <FilterSection
              title="Sort By"
              icon="i-mdi-sort"
            >
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                <AppInputRadio
                  v-for="option in sortOptions"
                  :key="`${option.field}-${option.direction}`"
                  :checked="currentSort.field === option.field && currentSort.direction === option.direction"
                  :label="option.label"
                  name="sort"
                  :value="`${option.field}-${option.direction}`"
                  @change="handleSortChange(option)"
                />
              </div>
            </FilterSection>
          </div>

          <!-- Row 1: Rating, Year, Votes -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <AppInputCheckbox
                  :checked="filterStore.filters.sources.includes('archive.org')"
                  label="Archive.org"
                  @change="filterStore.toggleSource('archive.org')"
                />

                <!-- YouTube Channels -->
                <div class="pl-4 space-y-2 border-l-2 border-gray-300 dark:border-gray-600">
                  <p class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-2">
                    YouTube Channels
                  </p>
                  <AppInputCheckbox
                    v-for="channel in youtubeChannels"
                    :key="channel"
                    :checked="filterStore.filters.sources.includes(channel)"
                    :label="channel"
                    @change="filterStore.toggleSource(channel)"
                  />
                </div>
              </div>
            </FilterSection>

            <!-- Developer Tools (Localhost Only) -->
            <FilterSection
              v-if="isLocalhost()"
              title="Developer Tools"
              icon="i-mdi-dev-to"
            >
              <div class="space-y-3">
                <AppInputCheckbox
                  :checked="filterStore.filters.showMissingMetadataOnly"
                  label="Show Missing Metadata Only"
                  @change="filterStore.toggleMissingMetadata()"
                />
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
import { YOUTUBE_CHANNELS, AVAILABLE_GENRES, AVAILABLE_COUNTRIES } from '@/constants/filters'
import { isLocalhost } from '@/utils/isLocalhost'
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { onClickOutside, useScrollLock } from '@vueuse/core'

interface Props {
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Use filter store
const filterStore = useFilterStore()

// Get sort options from utils
const sortOptions = SORT_OPTIONS

// Import filter constants
const youtubeChannels = YOUTUBE_CHANNELS
const availableGenres = AVAILABLE_GENRES
const availableCountries = AVAILABLE_COUNTRIES

// Safe access to current sort (handles SSR and undefined cases)
const currentSort = computed(() => filterStore.currentSortOption)

// Handle sort change
const handleSortChange = (option: SortOption) => {
  filterStore.setSort(option)
  // User can continue adjusting filters - manual close via X button or overlay
}

// Focus trap for accessibility
const filterMenuRef = ref<HTMLElement | null>(null)

// Scroll lock for body when menu is open
const isLocked = useScrollLock(typeof window !== 'undefined' ? document.body : null)

// Close menu when clicking outside
onClickOutside(filterMenuRef, () => {
  if (props.isOpen) {
    emit('close')
  }
})

// Activate focus trap when menu is open
const { activate, deactivate } = useFocusTrap(filterMenuRef, {
  immediate: false,
  allowOutsideClick: false, // Prevent clicks outside while trap is active
  escapeDeactivates: false, // We handle Escape in the parent component
  returnFocusOnDeactivate: true,
  initialFocus: 'button[aria-label="Close filters"]', // Auto-focus close button
  fallbackFocus: () => filterMenuRef.value as HTMLElement, // Fallback if close button not found
})

// Watch for menu open/close to manage focus trap and scroll lock
watch(() => props.isOpen, (isOpen) => {
  isLocked.value = isOpen
  if (isOpen) {
    // Small delay to ensure DOM is ready and animation has started
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        activate()
      }, 50)
    }
  } else {
    deactivate()
  }
})
</script>
