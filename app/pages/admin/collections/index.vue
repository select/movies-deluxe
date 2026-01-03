<template>
  <div class="min-h-screen bg-theme-bg text-theme-text pb-12">
    <MovieHeader />

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div
        v-if="!isLocal"
        class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center"
      >
        <div class="i-mdi-lock text-4xl text-red-500 mx-auto mb-4" />
        <h1 class="text-xl font-bold text-red-700 dark:text-red-400 mb-2">
          Access Denied
        </h1>
        <p class="text-theme-textmuted">
          Admin features are only available from localhost.
        </p>
      </div>

      <div
        v-else
        class="space-y-8"
      >
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
            class="text-sm font-bold text-blue-600 hover:text-blue-500 flex items-center gap-1"
          >
            <div class="i-mdi-arrow-left" />
            Back to Dashboard
          </NuxtLink>
        </div>

        <div class="bg-theme-surface border border-theme-border rounded-2xl p-6">
          <AdminCollectionSelector @select="selectedCollectionId = $event" />
        </div>

        <div
          v-if="selectedCollectionId"
          class="grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          <!-- Left: Search Results -->
          <div class="space-y-6">
            <h2 class="text-xl font-bold flex items-center gap-2">
              <div class="i-mdi-database-search text-blue-600" />
              Search Library
            </h2>
            <AdminMovieSearch
              :collection-id="selectedCollectionId"
              @add="onMovieAdded"
            />
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
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const isLocal = ref(false)
const selectedCollectionId = ref('')
const moviesList = ref<any>(null)

const movieStore = useMovieStore()

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
