<template>
  <main class="md:ml-16">
    <div class="px-4 lg:px-[6%] py-8">
      <!-- Breadcrumbs (optional) -->
      <nav v-if="breadcrumbs" class="flex mb-6 text-sm font-medium text-theme-textmuted">
        <NuxtLink
          :to="breadcrumbs.parentPath"
          class="hover:text-theme-accent transition-colors flex items-center gap-1"
        >
          <div :class="breadcrumbs.parentIcon"></div>
          {{ breadcrumbs.parentLabel }}
        </NuxtLink>
        <span class="mx-2 opacity-50">/</span>
        <span class="text-theme-text truncate">{{ breadcrumbs.currentLabel }}</span>
      </nav>

      <!-- Page Header -->
      <div class="mb-10">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="flex-1">
            <h1
              class="text-4xl font-black text-theme-text mb-3 tracking-tight flex items-center gap-3"
            >
              <div v-if="titleIcon" :class="titleIcon"></div>
              {{ title }}
            </h1>

            <p class="text-lg text-theme-textmuted max-w-3xl leading-relaxed">
              {{ description }}
            </p>
          </div>

          <div class="flex flex-col items-start md:items-end gap-4 w-full md:w-auto">
            <div v-if="movieCount > 0" class="flex flex-col items-start md:items-end gap-1">
              <div
                class="px-4 py-2 rounded-xl bg-theme-surface border border-theme-border/50 text-sm font-bold shadow-sm"
              >
                {{ movieCount }} movies
              </div>
              <div
                v-if="searchQuery && movieCount > 0"
                class="text-xs text-theme-accent font-bold px-1"
              >
                {{
                  filteredMovies.length === 0
                    ? 'No movies found'
                    : `Found ${filteredMovies.length} movie${filteredMovies.length === 1 ? '' : 's'}`
                }}
              </div>
            </div>

            <!-- Search Bar -->
            <AppSearchInput
              v-if="movieCount > 0"
              v-model="searchQuery"
              :placeholder="searchPlaceholder"
            />
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
      >
        <MovieCardSkeleton v-for="i in 12" :key="i" />
      </div>

      <!-- Movies Grid -->
      <template v-else-if="filteredMovies && filteredMovies.length > 0">
        <MovieVirtualGrid :movies="filteredMovies" :total-movies="filteredMovies.length" />
      </template>

      <!-- Empty State / No Results -->
      <div v-else class="flex flex-col items-center justify-center py-20 text-center">
        <div :class="emptyStateIcon" class="text-6xl text-theme-textmuted mb-4 opacity-20"></div>
        <h3 class="text-xl font-bold text-theme-text mb-2">
          {{ emptyStateTitle }}
        </h3>
        <p class="text-theme-textmuted mb-8">
          {{ emptyStateDescription }}
        </p>
        <button
          v-if="searchQuery && showClearSearch"
          class="px-6 py-2.5 rounded-xl bg-theme-accent text-black font-bold hover:scale-105 transition-transform"
          @click="searchQuery = ''"
        >
          Clear Search
        </button>
        <NuxtLink
          v-else-if="emptyStateButtonTo"
          :to="emptyStateButtonTo"
          class="px-6 py-2.5 rounded-xl bg-theme-accent text-black font-bold hover:scale-105 transition-transform inline-flex items-center gap-2"
        >
          <div v-if="emptyStateButtonIcon" :class="emptyStateButtonIcon"></div>
          {{ emptyStateButtonText }}
        </NuxtLink>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import Fuse from 'fuse.js'
import type { LightweightMovie } from '~/types'

interface Breadcrumbs {
  parentPath: string
  parentIcon: string
  parentLabel: string
  currentLabel: string
}

interface Props {
  // Page content
  title: string
  description: string
  titleIcon?: string
  breadcrumbs?: Breadcrumbs

  // Movies data
  movies: LightweightMovie[]
  movieCount: number
  isLoading: boolean

  // Search
  searchPlaceholder?: string

  // Empty state
  emptyStateIcon: string
  emptyStateTitle: string
  emptyStateDescription: string
  emptyStateButtonTo?: string
  emptyStateButtonText?: string
  emptyStateButtonIcon?: string
  showClearSearch?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  searchPlaceholder: 'Search movies...',
  showClearSearch: true,
})

// Search functionality
const searchQuery = ref('')

// Filtered movies with search
const filteredMovies = computed(() => {
  let filtered = props.movies

  if (searchQuery.value.trim()) {
    const fuse = new Fuse(filtered, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'genre', weight: 1 },
        { name: 'country', weight: 1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    })

    const results = fuse.search(searchQuery.value)
    filtered = results.map(result => result.item)
  }

  return filtered
})

// Computed empty state properties
const emptyStateTitle = computed(() => {
  if (props.movieCount === 0) {
    return props.emptyStateTitle
  }
  return searchQuery.value ? 'No movies found' : 'No movies in this collection'
})

const emptyStateDescription = computed(() => {
  if (props.movieCount === 0) {
    return props.emptyStateDescription
  }
  return searchQuery.value
    ? 'Try a different search term or clear your search.'
    : 'This collection is currently empty.'
})
</script>
