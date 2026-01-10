<template>
  <main class="md:ml-16">
    <div class="px-4 lg:px-[6%] py-8">
      <!-- Header with Search -->
      <div class="mb-10 flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
        <div class="flex-1">
          <h1 class="text-3xl font-black text-theme-text mb-2 tracking-tight">Collections</h1>
          <p class="text-theme-textmuted max-w-2xl leading-relaxed">
            Curated sets of movies organized by theme, actor, or genre.
          </p>
          <div
            v-if="searchQuery && filteredCollections.length === 0"
            class="mt-3 text-sm text-theme-textmuted"
          >
            No collections found matching "{{ searchQuery }}"
          </div>
          <div v-else-if="searchQuery" class="mt-3 text-sm text-theme-textmuted">
            Found {{ filteredCollections.length }} collection{{
              filteredCollections.length === 1 ? '' : 's'
            }}
          </div>
        </div>

        <!-- Search Bar -->
        <div v-if="collections.size > 0" class="relative w-full md:w-64 md:flex-shrink-0">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div class="i-mdi-magnify text-lg text-theme-textmuted"></div>
          </div>
          <input
            v-model="searchQuery"
            type="text"
            class="block w-full pl-10 pr-10 py-2 bg-theme-surface/50 border border-theme-border/50 focus:border-theme-primary rounded-full text-sm text-theme-text placeholder-theme-textmuted focus:outline-none transition-all focus:bg-theme-surface"
            placeholder="Search..."
          />
          <button
            v-if="searchQuery"
            class="absolute inset-y-0 right-0 pr-3 flex items-center"
            @click="searchQuery = ''"
          >
            <div
              class="i-mdi-close text-base text-theme-textmuted hover:text-theme-text transition-colors"
            ></div>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        <div
          v-for="i in 4"
          :key="i"
          class="h-64 rounded-2xl bg-theme-surface border border-theme-border/50 animate-pulse"
        ></div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="collections.size === 0"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="i-mdi:movie-roll text-6xl text-theme-textmuted mb-4 opacity-20"></div>
        <h3 class="text-xl font-bold text-theme-text mb-2">No collections found</h3>
        <p class="text-theme-textmuted">Check back later for curated movie collections.</p>
      </div>

      <!-- Collections Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <CollectionCard
          v-for="collection in filteredCollections"
          :key="collection.id"
          :collection="collection"
        />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import Fuse from 'fuse.js'

const { isLoading, collections } = storeToRefs(useCollectionsStore())
const { loadCollections } = useCollectionsStore()

const searchQuery = ref('')

// Filter collections based on search query and enabled status
const filteredCollections = computed(() => {
  const allCollections = Array.from(collections.value.values()).filter(c => c.enabled !== false)

  if (!searchQuery.value.trim()) {
    // No search query - just filter out disabled collections
    return allCollections.filter(c => c.enabled !== false)
  }

  // Create a fuse instance with all collections for search
  const fuse = new Fuse(allCollections, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'description', weight: 1 },
      { name: 'tags', weight: 1.5 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
  })

  // Search all collections, then filter out disabled ones from results
  const results = fuse.search(searchQuery.value)
  return results.map(result => result.item)
})

onMounted(() => {
  loadCollections()
})

useHead({
  title: 'Collections - Movies Deluxe',
  meta: [{ name: 'description', content: 'Curated movie collections from Movies Deluxe.' }],
})
</script>
