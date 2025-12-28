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
        'glass',
        'shadow-2xl',
        'overflow-hidden flex flex-col',
        // Mobile: Bottom sheet (< md breakpoint)
        'bottom-0 left-0 right-0 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 max-h-[90vh]',
        // Desktop: Left sidebar (>= md breakpoint)
        'md:top-0 md:left-0 md:bottom-0 md:right-auto md:h-full md:w-full md:max-w-xl md:rounded-none md:border-0 md:dark:border-gray-700 md:max-h-full',
        // Animation: translateY for mobile, translateX for desktop
        isOpen
          ? 'translate-y-0 md:translate-x-0'
          : 'translate-y-full md:translate-y-0 md:-translate-x-full',
      ]"
    >
      <!-- Mobile Close Button (fixed position, same as menu button) -->
      <button
        class="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gray-700 dark:bg-gray-600 text-white shadow-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-all flex items-center justify-center z-[60]"
        aria-label="Close filters"
        @click="emit('close')"
      >
        <div class="i-mdi-close text-2xl" />
      </button>
      <!-- Header -->
      <div class="flex items-center justify-between ">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <div class="i-mdi-filter-variant text-xl" />
          Filters
        </h2>
        <div class="flex items-center gap-2">
          <button
            v-if="hasActiveFilters || filters.searchQuery"
            class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-3 py-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            @click="clearAllFilters"
          >
            Clear All
          </button>
          <button
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            aria-label="Close filters"
            @click="emit('close')"
          >
            <div class="i-mdi-close text-xl" />
          </button>
        </div>
      </div>

      <!-- seperator -->
      <hr class="mx-4 my-4 border-gray-300 dark:border-gray-600" >
      <!-- Filter Content -->
      <div class="overflow-y-auto scrollbar-thin flex-1 md:h-[calc(100vh-4rem)] p-4">
        <div class="max-w-7xl mx-auto space-y-4 flex flex-col gap-4">
          <!-- Sort Section (Top) -->
            <FilterSection
              title="Sort By"
              icon="i-mdi-sort"
              :default-expanded="true"
            >
              <SortButtonGroup
                :current-sort="currentSortOption"
                :show-relevance="!!filters.searchQuery"
                @select="handleSortChange"
              />
            </FilterSection>

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
                  <span class="font-medium">{{ filters.minRating.toFixed(1) }}+</span>
                </div>
                <input
                  :value="filters.minRating"
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  @input="(e) => setMinRating(Number((e.target as HTMLInputElement).value))"
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
                  <span class="font-medium">{{ filters.minYear || '1910' }}+</span>
                </div>
                <input
                  :value="filters.minYear"
                  type="range"
                  min="1910"
                  max="2025"
                  step="1"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  @input="(e) => setMinYear(Number((e.target as HTMLInputElement).value))"
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
                  <span class="font-medium">{{ filters.minVotes.toLocaleString() }}+</span>
                </div>
                <input
                  :value="filters.minVotes"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  @input="(e) => setMinVotes(Number((e.target as HTMLInputElement).value))"
                >

              </div>
            </FilterSection>
          </div>

          <!-- Row 2: Genres and Countries (Full Width, Before Sources) -->
            <!-- Genre Filter -->
            <FilterSection
              title="Genres"
              icon="i-mdi-movie-filter"
            >
              <div v-if="isLoadingFilters" class="text-sm text-gray-500 dark:text-gray-400">
                Loading genres...
              </div>
              <CollapsibleFilterItems v-else ref="genresCollapsible" :max-lines="2">
                <button
                  v-for="genre in genres"
                  :key="genre.name"
                  :class="[
                    'px-3 py-1.5 text-sm rounded-full transition-colors inline-flex items-center gap-1.5',
                    filters.genres.includes(genre.name)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  ]"
                  :title="`${formatCountExact(genre.count)} movies`"
                  @click="toggleGenre(genre.name)"
                >
                  <span>{{ genre.name }}</span>
                  <span
                    :class="[
                      'text-xs font-normal',
                      filters.genres.includes(genre.name)
                        ? 'text-blue-100'
                        : 'text-gray-500 dark:text-gray-400'
                    ]"
                  >
                    {{ formatCount(genre.count) }}
                  </span>
                </button>
              </CollapsibleFilterItems>
            </FilterSection>

            <!-- Country Filter -->
            <FilterSection
              title="Countries"
              icon="i-mdi-earth"
            >
              <div v-if="isLoadingFilters" class="text-sm text-gray-500 dark:text-gray-400">
                Loading countries...
              </div>
              <CollapsibleFilterItems v-else ref="countriesCollapsible" :max-lines="2">
                <button
                  v-for="country in countries"
                  :key="country.name"
                  :class="[
                    'px-3 py-1.5 text-sm rounded-full transition-colors inline-flex items-center gap-1.5',
                    filters.countries.includes(country.name)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  ]"
                  :title="`${formatCountExact(country.count)} movies`"
                  @click="toggleCountry(country.name)"
                >
                  <span>{{ country.name }}</span>
                  <span
                    :class="[
                      'text-xs font-normal',
                      filters.countries.includes(country.name)
                        ? 'text-blue-100'
                        : 'text-gray-500 dark:text-gray-400'
                    ]"
                  >
                    {{ formatCount(country.count) }}
                  </span>
                </button>
              </CollapsibleFilterItems>
            </FilterSection>

          <!-- Row 3: Source and Developer Tools -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Source Filter -->
            <FilterSection
              title="Source"
              icon="i-mdi-source-branch"
            >
              <div class="space-y-3">
                <!-- Archive.org -->
                <AppInputCheckbox
                  :checked="filters.sources.includes('archive.org')"
                  label="Archive.org"
                  @change="toggleSource('archive.org')"
                />

                <!-- YouTube Channels -->
                <div class="pl-4 space-y-2 border-l-2 border-gray-300 dark:border-gray-600">
                  <p class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-2">
                    YouTube Channels
                  </p>
                  <div v-if="isLoadingFilters" class="text-sm text-gray-500 dark:text-gray-400">
                    Loading channels...
                  </div>
                  <AppInputCheckbox
                    v-for="channel in channels"
                    v-else
                    :key="channel.id"
                    :checked="filters.sources.includes(channel.name)"
                    @change="toggleSource(channel.name)"
                  >
                    <span class="flex items-center justify-between gap-2 flex-1">
                      <span>{{ channel.name }}</span>
                      <span
                        class="text-xs text-gray-500 dark:text-gray-400"
                        :title="`${formatCountExact(channel.count)} movies`"
                      >
                        {{ formatCount(channel.count) }}
                      </span>
                    </span>
                  </AppInputCheckbox>
                </div>
              </div>
            </FilterSection>

            <!-- Developer Tools (Localhost Only) -->
            <FilterSection
              v-if="isDev"
              title="Developer Tools"
              icon="i-mdi-dev-to"
            >
              <div class="space-y-3">
                <AppInputCheckbox
                  :checked="filters.showMissingMetadataOnly"
                  label="Show Missing Metadata Only"
                  @change="toggleMissingMetadata()"
                />
              </div>
            </FilterSection>
          </div>
          <!-- Error state -->
          <div v-if="filterLoadError" class="text-sm text-red-500 dark:text-red-400 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {{ filterLoadError }}
            <button class="underline ml-2 font-medium" @click="fetchFilterOptions">Retry</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SortOption, GenreOption, CountryOption, ChannelOption } from '~/types'
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
import { onClickOutside, useScrollLock } from '@vueuse/core'

interface Props {
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Use unified movie store
const { filters, currentSortOption, hasActiveFilters } = storeToRefs(useMovieStore())
const { setMinRating, setMinYear, setMinVotes, toggleSource, toggleMissingMetadata, toggleGenre, toggleCountry, setSort, clearAllFilters } = useMovieStore()

// Dynamic filter options
const genres = ref<GenreOption[]>([])
const countries = ref<CountryOption[]>([])
const channels = ref<ChannelOption[]>([])
const isLoadingFilters = ref(true)
const filterLoadError = ref<string | null>(null)

// Collapsible component refs
const genresCollapsible = ref()
const countriesCollapsible = ref()

const fetchFilterOptions = async () => {
  isLoadingFilters.value = true
  filterLoadError.value = null

  try {
    const db = useDatabase()
    if (db.isReady.value) {
      console.log('[FilterMenu] Fetching filter options from SQLite...')
      const options = await db.getFilterOptions()
      genres.value = options.genres
      countries.value = options.countries
      channels.value = options.channels

      // Trigger overflow check for collapsible components after data loads
      nextTick(() => {
        genresCollapsible.value?.checkOverflow()
        countriesCollapsible.value?.checkOverflow()
      })
    }
  } catch (error) {
    console.error('Failed to load filter options:', error)
    filterLoadError.value = 'Failed to load filter options'
  } finally {
    isLoadingFilters.value = false
  }
}

// Watch for DB ready to refresh filters from SQLite
const db = useDatabase()
watch(() => db.isReady.value, (ready) => {
  if (ready) {
    fetchFilterOptions()
  }
})

// Developer mode detection (localhost only)
const isDev = ref(false)
onMounted(() => {
  isDev.value = isLocalhost()
  fetchFilterOptions()
})

// Handle sort change
const handleSortChange = (option: SortOption) => {
  setSort(option)
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
