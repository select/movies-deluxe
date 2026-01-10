<template>
  <div class="min-h-screen bg-theme-background text-theme-text p-4 md:ml-16 transition-colors duration-300">
    <main class="max-w-7xl mx-auto space-y-8">
      <div
        v-if="!isLocal"
        class="flex flex-col items-center justify-center h-[60vh] text-center"
      >
        <div class="i-mdi-lock text-64px text-gray-300 dark:text-gray-700 mb-4" />
        <h1 class="text-2xl font-bold mb-2">
          Access Denied
        </h1>
        <p class="text-theme-textmuted">
          The admin interface is only available on localhost.
        </p>
        <NuxtLink
          to="/"
          class="mt-6 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
        >
          Back to Home
        </NuxtLink>
      </div>

      <div
        v-else
        class="flex flex-col gap-8"
      >
        <!-- Header -->
        <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-3xl font-bold flex items-center gap-3">
              <div class="i-mdi-movie-edit text-blue-600" />
              Collection Editor
            </h1>
            <p class="text-theme-textmuted mt-1">
              Add and remove movies from collections
            </p>
          </div>
          <NuxtLink
            to="/admin"
            class="px-4 py-2 text-sm bg-theme-surface border border-theme-border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <div class="i-mdi-arrow-left" />
            Back to Dashboard
          </NuxtLink>
        </header>

        <!-- Movie Editor -->
        <section class="bg-theme-surface border border-theme-border rounded-2xl p-6">
          <AdminCollectionSelector
            ref="collectionSelector"
            @select="selectedCollectionId = $event"
          />
        </section>

        <!-- Collection Editor -->
        <section
          v-if="selectedCollectionId"
          class="grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          <!-- Left: Search & Queries -->
          <div class="space-y-8">
            <!-- Detailed Collection Card -->
            <div
              v-if="selectedCollection"
              class="bg-theme-surface border border-theme-border rounded-2xl p-6 space-y-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-2">
                  <div class="flex items-center gap-3">
                    <h2 class="text-2xl font-bold">
                      {{ selectedCollection.name }}
                    </h2>
                    <span
                      v-if="selectedCollection.enabled === false"
                      class="px-2 py-0.5 bg-yellow-600/10 text-yellow-600 dark:text-yellow-400 border border-yellow-600/20 rounded text-xs font-bold uppercase"
                    >
                      Hidden
                    </span>
                  </div>

                  <!-- Tags -->
                  <div
                    v-if="selectedCollection.tags?.length"
                    class="flex flex-wrap gap-2"
                  >
                    <span
                      v-for="tag in selectedCollection.tags"
                      :key="tag"
                      class="px-2 py-1 bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/20 rounded-lg text-xs font-medium"
                    >
                      {{ tag }}
                    </span>
                  </div>

                  <p class="text-theme-textmuted max-w-3xl">
                    {{ selectedCollection.description || 'No description provided.' }}
                  </p>

                  <div class="flex items-center gap-2 text-sm font-mono text-theme-textmuted">
                    <div class="i-mdi-movie text-theme-text" />
                    <span class="text-theme-text">{{ selectedCollection.movieIds.length }}</span> movies in collection
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2">
                  <button
                    class="p-2 rounded-xl border border-theme-border hover:bg-theme-background transition-colors"
                    :class="selectedCollection.enabled === false ? 'text-green-600' : 'text-yellow-600'"
                    title="Toggle Visibility"
                    @click="collectionSelector?.toggleEnabled(selectedCollection)"
                  >
                    <div
                      :class="selectedCollection.enabled === false ? 'i-mdi-eye' : 'i-mdi-eye-off'"
                      class="text-xl"
                    />
                  </button>
                  <button
                    class="p-2 rounded-xl border border-theme-border hover:bg-theme-background text-blue-600 transition-colors"
                    title="Edit Collection"
                    @click="collectionSelector?.editCollection(selectedCollection)"
                  >
                    <div class="i-mdi-pencil text-xl" />
                  </button>
                  <button
                    class="p-2 rounded-xl border border-theme-border hover:bg-theme-background text-red-600 transition-colors"
                    title="Delete Collection"
                    @click="collectionSelector?.confirmDelete(selectedCollection)"
                  >
                    <div class="i-mdi-delete text-xl" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Search Library -->
	          <div class="space-y-6">
	            <h2 class="text-xl font-bold flex items-center gap-2">
	              <div class="i-mdi-magnify text-blue-600" />
	              Search Library
	            </h2>
	            <AdminMovieSearch
	              :collection-id="selectedCollectionId"
	              @add="onMovieAdded"
	            />
	          </div>



          </div>

          <!-- Right: Collection Movies -->
          <div class="space-y-6">
          <!-- Saved Queries -->
          <div class="bg-theme-surface border border-theme-border rounded-2xl p-6 space-y-6">
            <h2 class="text-xl font-bold flex items-center gap-2">
              <div class="i-mdi-database-clock text-blue-600" />
              Dynamic Queries
            </h2>
            <AdminSavedQueryManager
              :collection-id="selectedCollectionId"
              :queries="selectedCollection?.savedQueries"
              @filters-applied="onFiltersApplied"
            />
          </div>
            <h2 class="text-xl font-bold flex items-center gap-2">
              <div class="i-mdi-playlist-play text-blue-600" />
              Collection Movies
            </h2>
            <AdminCollectionMoviesList
              ref="moviesList"
              :collection-id="selectedCollectionId"
            />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { Collection } from '~/types'

// Set page title
useHead({
  title: 'Collection Editor - Movies Deluxe Admin',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
  ],
})

const isLocal = ref(false)
const selectedCollectionId = ref('')
const collectionSelector = ref<{
  editCollection: (collection: Collection) => void
  toggleEnabled: (collection: Collection) => void
  confirmDelete: (collection: Collection) => void
  openCreateModal: () => void
} | null>(null)
const moviesList = ref<{ refresh: () => Promise<void> } | null>(null)

const movieStore = useMovieStore()
const collectionsStore = useCollectionsStore()
const { collections } = storeToRefs(collectionsStore)

const selectedCollection = computed(() => {
  if (!selectedCollectionId.value) return null
  return collections.value.get(selectedCollectionId.value) || null
})

onMounted(async () => {
  isLocal.value = isLocalhost()
  if (isLocal.value) {
    await movieStore.loadFromFile()
  }
})

const onMovieAdded = () => {
  // Refresh collection list
  if (moviesList.value) {
    moviesList.value.refresh()
  }
}

const onFiltersApplied = () => {
  // Filters were applied from saved query - the AdminMovieSearch component
  // will automatically show results due to the filter watchers
}
</script>
