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
          <AdminCollectionSelector @select="selectedCollectionId = $event" />
        </section>

        <!-- Collection Editor -->
        <section
          v-if="selectedCollectionId"
          class="grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          <!-- Left: Search & Queries -->
          <div class="space-y-8">
            <!-- Tags Editor -->
            <div class="bg-theme-surface border border-theme-border rounded-2xl p-6 space-y-6">
              <h2 class="text-xl font-bold flex items-center gap-2">
                <div class="i-mdi-tag-multiple text-blue-600" />
                Collection Metadata
              </h2>
              <AdminCollectionTagsEditor
                :collection-id="selectedCollectionId"
                :initial-tags="selectedCollection?.tags"
              />
            </div>

            <!-- Saved Queries -->
            <div class="bg-theme-surface border border-theme-border rounded-2xl p-6 space-y-6">
              <h2 class="text-xl font-bold flex items-center gap-2">
                <div class="i-mdi-database-clock text-blue-600" />
                Dynamic Queries
              </h2>
              <AdminSavedQueryManager
                :collection-id="selectedCollectionId"
                :queries="selectedCollection?.savedQueries"
              />
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
const isLocal = ref(false)
const selectedCollectionId = ref('')
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
</script>
